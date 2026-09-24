import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, Trash2, Plus, Search, Database, Car, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import api from '../../services/api';
import { creativeService } from '../../services/creative';
import { BRANDS, IDLE_SYNC, type SyncJobStatus, type SyncedModel } from '../../utils/settings';

// Our extra: OEM model sync and the manual model repository (moved from SettingsPage.tsx).
export function ModelLibraryTab({ brands: selectedBrands }: { brands: string[] }) {
  const { addToast } = useToast();
  const [syncedModels, setSyncedModels] = useState<SyncedModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrandFilter, setSelectedBrandFilter] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncJobStatus>(IDLE_SYNC);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedModelDetail, setSelectedModelDetail] = useState<SyncedModel | null>(null);
  const [activeColorPreview, setActiveColorPreview] = useState<string>('');
  const [activePreviewUrl, setActivePreviewUrl] = useState<string>('');

  // Manually Add/Edit Model form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualBrand, setManualBrand] = useState('Hyundai');
  const [manualBrandType, setManualBrandType] = useState<'known' | 'custom'>('known');
  const [customBrandName, setCustomBrandName] = useState('');
  const [manualModelName, setManualModelName] = useState('');
  const [manualVariants, setManualVariants] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  // Unified Images List
  const [manualImages, setManualImages] = useState<string[]>([]);
  const [isPasteActive, setIsPasteActive] = useState(false);
  const [uploadingImagesCount, setUploadingImagesCount] = useState(0);

  // Deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingModel, setDeletingModel] = useState<SyncedModel | null>(null);

  const resetManualForm = () => {
    setIsEditMode(false);
    setEditingModelId(null);
    setManualBrand('Hyundai');
    setManualBrandType('known');
    setCustomBrandName('');
    setManualModelName('');
    setManualVariants('');
    setManualImages([]);
    setIsPasteActive(false);
    setUploadingImagesCount(0);
  };

  const handleImagePaste = async (e: React.ClipboardEvent) => {
    if (!isPasteActive) return; // Only paste when the box is clicked/focused

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length === 0) return;
    e.preventDefault();

    setUploadingImagesCount(prev => prev + imageFiles.length);
    try {
      const promises = imageFiles.map(async (file) => {
        const res = await creativeService.uploadImage(file);
        return res.url;
      });
      const urls = await Promise.all(promises);
      setManualImages(prev => [...prev, ...urls]);
      addToast({
        type: 'success',
        title: 'Images Pasted',
        message: `Pasted and uploaded ${imageFiles.length} image(s) successfully.`
      });
    } catch {
      addToast({ type: 'error', title: 'Upload Failed', message: 'Failed to upload some clipboard images.' });
    } finally {
      setUploadingImagesCount(prev => Math.max(0, prev - imageFiles.length));
    }
  };

  const handleMultipleImagesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);

    setUploadingImagesCount(prev => prev + fileList.length);
    try {
      const promises = fileList.map(async (file) => {
        const res = await creativeService.uploadImage(file);
        return res.url;
      });
      const urls = await Promise.all(promises);
      setManualImages(prev => [...prev, ...urls]);
      addToast({
        type: 'success',
        title: 'Images Uploaded',
        message: `Uploaded ${fileList.length} image(s) successfully.`
      });
    } catch {
      addToast({ type: 'error', title: 'Upload Failed', message: 'Failed to upload some images.' });
    } finally {
      setUploadingImagesCount(prev => Math.max(0, prev - fileList.length));
    }
  };

  // Loads the repository. Callers that want the spinner set loadingModels first.
  const loadModels = useCallback(() => {
    api.get<{ success: boolean; models: SyncedModel[] }>('/model-library')
      .then((res) => {
        setSyncedModels(res.models || []);
      })
      .catch((err) => {
        console.error(err);
        addToast({ type: 'error', title: 'Error', message: 'Failed to load model library' });
      })
      .finally(() => setLoadingModels(false));
  }, [addToast]);

  const fetchModels = () => {
    setLoadingModels(true);
    loadModels();
  };

  // Polls a running OEM sync every 1.5 s and reloads the repository when it completes.
  const checkSyncStatus = useCallback(function poll(): void {
    api.get<{ success: boolean; syncJob: SyncJobStatus }>('/model-library/sync/status')
      .then((res) => {
        if (!res.success || !res.syncJob) return;
        setSyncStatus(res.syncJob);
        if (res.syncJob.status === 'in_progress') {
          setIsSyncing(true);
          setTimeout(poll, 1500);
        } else {
          setIsSyncing(false);
          if (res.syncJob.status === 'completed') loadModels();
        }
      })
      .catch((err) => console.error(err));
  }, [loadModels]);

  // Opening the tab loads the repository and resumes watching a sync that is still running.
  useEffect(() => {
    loadModels();
    checkSyncStatus();
  }, [loadModels, checkSyncStatus]);

  const handleStartSync = async () => {
    if (selectedBrands.length === 0) {
      addToast({ type: 'warning', title: 'Brands Required', message: 'Please select at least one brand to sync.' });
      return;
    }
    setIsSyncing(true);
    try {
      const res = await api.post<{ success: boolean }>('/model-library/sync', { brands: selectedBrands });
      if (res.success) {
        addToast({ type: 'success', title: 'Sync Started', message: 'OEM sync job started in the background.' });
        checkSyncStatus();
      }
    } catch {
      setIsSyncing(false);
      addToast({ type: 'error', title: 'Sync Failed', message: 'Could not start OEM model sync.' });
    }
  };

  const handleSaveManualModel = async () => {
    const finalBrand = manualBrandType === 'known' ? manualBrand : customBrandName.trim();
    if (!finalBrand) {
      addToast({ type: 'warning', title: 'Brand Required', message: 'Please specify a brand for the model.' });
      return;
    }
    if (!manualModelName.trim()) {
      addToast({ type: 'warning', title: 'Model Name Required', message: 'Please enter a model name.' });
      return;
    }
    if (manualImages.length === 0) {
      addToast({ type: 'warning', title: 'Images Required', message: 'Please upload or paste at least one photo.' });
      return;
    }

    const imagesArray = manualImages.map((url, idx) => ({
      angle: idx === 0 ? 'front_exterior' : 'other',
      url
    }));

    const coloursArray = [{
      name: 'Default',
      hex: '#888888',
      images: imagesArray
    }];

    try {
      let res;
      if (isEditMode && editingModelId) {
        res = await api.put<{ success: boolean; model: SyncedModel }>(`/model-library/${editingModelId}`, {
          brand: finalBrand,
          model_name: manualModelName.trim(),
          variants: manualVariants.split(',').map((v) => v.trim()).filter(Boolean),
          images: imagesArray,
          colours: coloursArray
        });
      } else {
        res = await api.post<{ success: boolean; model: SyncedModel }>('/model-library', {
          brand: finalBrand,
          model_name: manualModelName.trim(),
          variants: manualVariants.split(',').map((v) => v.trim()).filter(Boolean),
          images: imagesArray,
          colours: coloursArray
        });
      }

      if (res.success) {
        addToast({
          type: 'success',
          title: isEditMode ? 'Model Updated' : 'Model Added',
          message: isEditMode ? 'Custom model updated successfully.' : 'Custom model added to repository.'
        });
        setShowAddModal(false);
        resetManualForm();
        fetchModels();
        if (isEditMode) {
          setSelectedModelDetail(res.model);
        }
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: isEditMode ? 'Failed to update custom model.' : 'Failed to add custom model.' });
    }
  };

  const handleDeleteModel = async (model: SyncedModel) => {
    try {
      const res = await api.delete<{ success: boolean }>(`/model-library/${model.id}`);
      if (res.success) {
        addToast({ type: 'success', title: 'Model Deleted', message: 'Model has been removed from repository.' });
        setSelectedModelDetail(null);
        setShowDeleteConfirm(false);
        setDeletingModel(null);
        fetchModels();
      }
    } catch {
      addToast({ type: 'error', title: 'Deletion Failed', message: 'Failed to delete model.' });
    }
  };

  return (
        <div className="space-y-6">
          {/* Sync Control Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">OEM Model Repository Sync</h3>
                <p className="text-xs text-slate-500 mt-0.5">Sync high-quality brand-approved models and multi-angle imagery for your dealership brands.</p>
              </div>
              <Button
                onClick={handleStartSync}
                disabled={isSyncing}
                className="text-xs bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/10 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>

            {/* Sync Progress Bar */}
            {isSyncing && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-ping" />
                    Syncing Brand: <span className="text-orange-600 font-bold">{syncStatus.currentBrand || 'Initialising'}</span>
                  </span>
                  <span>{syncStatus.progress}% Complete</span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300" style={{ width: `${syncStatus.progress}%` }} />
                </div>
                {/* Brand-by-brand status indicator */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/60">
                  {Object.entries(syncStatus.brands).map(([brand, status]) => (
                    <div key={brand} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className={`w-2 h-2 rounded-full ${
                        status === 'completed' ? 'bg-green-500' :
                        status === 'syncing' ? 'bg-orange-500 animate-pulse' : 'bg-slate-300'
                      }`} />
                      <span className="truncate">{brand}</span>
                      {status === 'completed' && <Check className="w-3 h-3 text-green-600 shrink-0" />}
                      {status === 'syncing' && <RefreshCw className="w-3 h-3 text-orange-500 animate-spin shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Last Synced Brands */}
            {!isSyncing && syncedModels.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs items-center">
                <span className="text-slate-500 font-medium">Synced Brands:</span>
                {Array.from(new Set(syncedModels.filter(m => m.source === 'cardekho_oem_db').map(m => m.brand))).map(brand => {
                  const maxSynced = syncedModels
                    .filter(m => m.brand === brand)
                    .map(m => new Date(m.synced_at).getTime());
                  const lastDate = maxSynced.length > 0 ? new Date(Math.max(...maxSynced)).toLocaleDateString('en-IN') : 'N/A';
                  return (
                    <span key={brand} className="bg-slate-150 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-semibold">
                      {brand} <span className="text-[10px] text-slate-500 font-normal ml-1">Synced: {lastDate}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Repository Browser card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">Model Repository Browser</h3>
                <p className="text-xs text-slate-500 mt-0.5">Browse synced model specifications, color variants, and angle imagery.</p>
              </div>
              <Button
                onClick={() => {
                  resetManualForm();
                  setShowAddModal(true);
                }}
                className="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-350 flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
              >
                <Plus className="w-3.5 h-3.5" />
                Manually Add Model
              </Button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search model name..."
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Brand Filter */}
              <div className="w-full sm:w-48">
                <select
                  value={selectedBrandFilter}
                  onChange={(e) => setSelectedBrandFilter(e.target.value)}
                  className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium"
                >
                  <option value="" className="bg-white">All Brands</option>
                  {Array.from(new Set(syncedModels.map(m => m.brand))).map(brand => (
                    <option key={brand} value={brand} className="bg-white">{brand}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Model Card Grid */}
            {loadingModels ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-500" />
                Loading repository models...
              </div>
            ) : syncedModels.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-250 rounded-xl text-slate-500 text-sm">
                <Database className="w-8 h-8 mx-auto mb-2 text-slate-450 opacity-60" />
                No models in library. Please trigger a sync to load brand-approved vehicles.
              </div>
            ) : (
              (() => {
                const filtered = syncedModels.filter(m => {
                  const matchesSearch = searchQuery.trim() === '' || 
                    m.model_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    m.brand.toLowerCase().includes(searchQuery.toLowerCase());
                  const matchesBrand = selectedBrandFilter === '' || m.brand === selectedBrandFilter;
                  return matchesSearch && matchesBrand;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      No models matched your filters.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {filtered.map(model => {
                      const defaultImg = model.images.find(img => img.angle === 'front_exterior')?.url || model.images[0]?.url;
                      return (
                        <div
                          key={model.id}
                          onClick={() => {
                            setSelectedModelDetail(model);
                            setActiveColorPreview(model.colours?.[0]?.name || '');
                            const firstImg = model.images?.[0]?.url || '';
                            setActivePreviewUrl(firstImg);
                          }}
                          className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md hover:border-orange-300 transition-all duration-200 cursor-pointer flex flex-col group"
                        >
                          <div className="aspect-[4/3] bg-slate-100 border-b border-slate-100 overflow-hidden relative">
                            {defaultImg ? (
                              <img src={defaultImg} alt={model.model_name} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400"><Car className="w-10 h-10" /></div>
                            )}
                            <span className={`absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              model.source === 'manual_upload' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-green-50 text-green-700 border border-green-200'
                            }`}>
                              {model.source === 'manual_upload' ? 'Manual' : 'Synced'}
                            </span>
                          </div>
                          <div className="p-4 flex-1 flex flex-col justify-between">
                            <div>
                              <p className="text-[10px] text-slate-500 font-semibold uppercase">{model.brand}</p>
                              <p className="font-bold text-slate-800 text-sm mt-0.5">{model.model_name}</p>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                              <span>{model.variants.length} Variants</span>
                              <span>{model.colours.length} Colors</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>

          {/* Model Detail Modal */}
          {selectedModelDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl w-full shadow-2xl space-y-5 overflow-y-auto max-h-[90vh] relative">
                <button
                  onClick={() => setSelectedModelDetail(null)}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{selectedModelDetail.brand}</span>
                  <h3 className="text-xl font-bold text-slate-900 mt-0.5">{selectedModelDetail.model_name}</h3>
                </div>

                {/* Main Preview */}
                <div className="aspect-video bg-slate-100 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center relative shadow-xs">
                  {(activePreviewUrl || (selectedModelDetail.images && selectedModelDetail.images[0]?.url)) ? (
                    <img src={activePreviewUrl || selectedModelDetail.images[0]?.url} alt="Vehicle Preview" className="w-full h-full object-cover" />
                  ) : (
                    <Car className="w-16 h-16 text-slate-350" />
                  )}
                </div>

                {/* Image Thumbnails Strip */}
                {selectedModelDetail.images && selectedModelDetail.images.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Available Views / Images</p>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                      {selectedModelDetail.images.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setActivePreviewUrl(img.url);
                          }}
                          className={`w-16 h-12 rounded-lg border-2 overflow-hidden shrink-0 cursor-pointer transition-all duration-150 ${
                            (activePreviewUrl === img.url || (!activePreviewUrl && idx === 0))
                              ? 'border-orange-500 scale-[1.04] shadow-xs'
                              : 'border-slate-200 hover:border-slate-350'
                          }`}
                        >
                          <img src={img.url} alt={`View ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Color Swatch Selectors */}
                {selectedModelDetail.colours.length > 0 && selectedModelDetail.colours[0]?.name !== 'Default' && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600">Available Colors: <span className="text-slate-800 font-bold">{activeColorPreview}</span></p>
                    <div className="flex flex-wrap gap-2.5">
                      {selectedModelDetail.colours.map(color => (
                        <button
                          key={color.name}
                          onClick={() => {
                            setActiveColorPreview(color.name);
                            const colorImg = color.images?.[0]?.url;
                            if (colorImg) setActivePreviewUrl(colorImg);
                          }}
                          className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer relative ${
                            activeColorPreview === color.name ? 'border-orange-500 scale-[1.12] shadow-sm' : 'border-slate-200 hover:border-slate-400'
                          }`}
                          style={{ backgroundColor: color.hex }}
                          title={color.name}
                        >
                          {activeColorPreview === color.name && (
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white mix-blend-difference font-bold">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Variant list & Metadata */}
                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold block mb-1">VARIANTS</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedModelDetail.variants.map(v => (
                        <span key={v} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">{v}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block mb-1">METADATA</span>
                    <p className="text-slate-600 font-medium">Source: <span className="capitalize">{selectedModelDetail.source.replace(/_/g, ' ')}</span></p>
                    <p className="text-slate-600 font-medium mt-0.5">Synced At: {new Date(selectedModelDetail.synced_at).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>

                {/* Edit & Delete Action Buttons */}
                <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                  <Button
                    onClick={() => {
                      setIsEditMode(true);
                      setEditingModelId(selectedModelDetail.id);
                      
                      const matchKnownBrand = BRANDS.find(b => b.toLowerCase() === selectedModelDetail.brand.toLowerCase());
                      if (matchKnownBrand) {
                        setManualBrand(matchKnownBrand);
                        setManualBrandType('known');
                        setCustomBrandName('');
                      } else {
                        setManualBrandType('custom');
                        setCustomBrandName(selectedModelDetail.brand);
                      }
                      
                      setManualModelName(selectedModelDetail.model_name);
                      setManualVariants(selectedModelDetail.variants.join(', '));
                      
                      // Prepopulate unified images array
                      const urls = selectedModelDetail.images.map(img => img.url);
                      setManualImages(urls);
                      
                      setShowAddModal(true);
                    }}
                    className="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-350 cursor-pointer flex items-center gap-1.5"
                  >
                    Edit Model
                  </Button>
                  <Button
                    onClick={() => {
                      setDeletingModel(selectedModelDetail);
                      setShowDeleteConfirm(true);
                    }}
                    className="text-xs bg-red-500 hover:bg-red-600 text-white cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Model
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Deletion Confirmation Dialog */}
          {showDeleteConfirm && deletingModel && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl space-y-4 text-center">
                <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Delete Model?</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Are you sure you want to delete <span className="font-semibold text-slate-700">{deletingModel.brand} {deletingModel.model_name}</span>? This action cannot be undone and will remove all custom specifications.
                  </p>
                </div>
                <div className="flex gap-2 justify-center pt-2">
                  <Button
                    variant="danger"
                    onClick={() => handleDeleteModel(deletingModel)}
                    className="text-xs cursor-pointer px-4 shadow-sm"
                  >
                    Yes, Delete
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => { setShowDeleteConfirm(false); setDeletingModel(null); }}
                    className="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer px-4"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Manually Add Model Modal */}
          {showAddModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-lg w-full shadow-2xl space-y-4 relative my-8">
                <button
                  onClick={() => { resetManualForm(); setShowAddModal(false); }}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-650 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <h3 className="text-base font-bold text-slate-900">
                  {isEditMode ? 'Edit Custom Model' : 'Manually Add Model'}
                </h3>

                <div className="space-y-4">
                  {/* Brand Type Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Brand</label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setManualBrandType('known')}
                        className={`flex-1 text-xs py-1.5 rounded-lg border font-medium cursor-pointer transition-all duration-150 ${
                          manualBrandType === 'known'
                            ? 'bg-orange-50 text-orange-600 border-orange-500 font-bold shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Select Brand
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualBrandType('custom')}
                        className={`flex-1 text-xs py-1.5 rounded-lg border font-medium cursor-pointer transition-all duration-150 ${
                          manualBrandType === 'custom'
                            ? 'bg-orange-50 text-orange-600 border-orange-500 font-bold shadow-xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Custom Brand
                      </button>
                    </div>
                    {manualBrandType === 'known' ? (
                      <select
                        value={manualBrand}
                        onChange={(e) => setManualBrand(e.target.value)}
                        className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-805 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium"
                      >
                        {BRANDS.map(brand => (
                          <option key={brand} value={brand} className="bg-white">{brand}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={customBrandName}
                        onChange={(e) => setCustomBrandName(e.target.value)}
                        placeholder="e.g. Aston Martin, Yamaha, Ducati"
                        className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium"
                      />
                    )}
                  </div>

                  {/* Model Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Model Name</label>
                    <input
                      type="text"
                      value={manualModelName}
                      onChange={(e) => setManualModelName(e.target.value)}
                      placeholder="e.g. Creta, Thar, Activa"
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium"
                    />
                  </div>

                  {/* Variants */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Variants (comma-separated)</label>
                    <input
                      type="text"
                      value={manualVariants}
                      onChange={(e) => setManualVariants(e.target.value)}
                      placeholder="e.g. S, SX, SX(O)"
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-medium"
                    />
                  </div>

                  {/* Multi-image upload / Paste area */}
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Model Photos (Upload or Paste)</label>
                    
                    <div
                      tabIndex={0}
                      onFocus={() => setIsPasteActive(true)}
                      onBlur={() => setIsPasteActive(false)}
                      onPaste={handleImagePaste}
                      onClick={(e) => e.currentTarget.focus()}
                      className={`aspect-[21/9] rounded-xl border border-dashed flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all duration-200 outline-none select-none ${
                        isPasteActive
                          ? 'bg-orange-50/50 border-orange-500 ring-2 ring-orange-500/20'
                          : 'bg-slate-50/50 border-slate-300 hover:border-orange-500 hover:bg-slate-50 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
                      }`}
                    >
                      {uploadingImagesCount > 0 ? (
                        <div className="flex flex-col items-center gap-2">
                          <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
                          <span className="text-[10px] font-bold text-slate-700">Uploading {uploadingImagesCount} image(s)...</span>
                        </div>
                      ) : isPasteActive ? (
                        <div className="space-y-1 animate-pulse">
                          <Plus className="w-5 h-5 text-orange-500 mx-auto" />
                          <span className="text-[11px] font-bold text-orange-600 block">Ready to Paste!</span>
                          <span className="text-[9px] text-slate-550 block">
                            Press Ctrl+V / Cmd+V to paste your clipboard images here, or{' '}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                document.getElementById('manual-multiple-images-upload')?.click();
                              }}
                              className="text-orange-600 underline font-bold hover:text-orange-700 cursor-pointer inline-block bg-transparent border-0 p-0"
                            >
                              browse files
                            </button>
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Plus className="w-5 h-5 text-slate-400 mx-auto" />
                          <span className="text-[11px] font-bold text-slate-700 block">
                            Click here to focus & paste, or{' '}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                document.getElementById('manual-multiple-images-upload')?.click();
                              }}
                              className="text-orange-600 underline font-bold hover:text-orange-700 cursor-pointer inline-block bg-transparent border-0 p-0"
                            >
                              browse files
                            </button>
                          </span>
                          <span className="text-[9px] text-slate-400 block">Supports selecting multiple files or pasting clipboard images</span>
                        </div>
                      )}
                    </div>

                    <input
                      type="file"
                      accept="image/*"
                      id="manual-multiple-images-upload"
                      className="hidden"
                      multiple
                      onChange={(e) => handleMultipleImagesUpload(e.target.files)}
                    />

                    {/* Uploaded Images List Grid */}
                    {manualImages.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Uploaded Photos ({manualImages.length})</label>
                        <div className="grid grid-cols-4 gap-2.5 max-h-48 overflow-y-auto p-1.5 border border-slate-100 rounded-xl bg-slate-50/50 shadow-inner">
                          {manualImages.map((url, idx) => (
                            <div key={idx} className="relative aspect-square rounded-lg border border-slate-250 overflow-hidden bg-white shadow-xs group">
                              <img src={url} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                              
                              {/* Cover Badge or Set As Cover */}
                              {idx === 0 ? (
                                <span className="absolute top-1 left-1 bg-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-xs">
                                  Cover
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setManualImages(prev => {
                                      const next = [...prev];
                                      const [target] = next.splice(idx, 1);
                                      if (target) next.unshift(target);
                                      return next;
                                    });
                                  }}
                                  className="absolute top-1 left-1 bg-black/60 hover:bg-orange-500 text-white text-[7px] font-bold px-1.5 py-0.5 rounded shadow-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                >
                                  Set Cover
                                </button>
                              )}

                              {/* Hover Delete Action */}
                              <button
                                type="button"
                                onClick={() => {
                                  setManualImages(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="absolute top-1 right-1 p-1 bg-red-500/90 text-white rounded-full hover:bg-red-600 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <Button
                    onClick={handleSaveManualModel}
                    disabled={
                      !manualModelName.trim() || 
                      manualImages.length === 0 || 
                      (manualBrandType === 'custom' && !customBrandName.trim())
                    }
                    className="text-xs bg-orange-500 hover:bg-orange-600 text-white cursor-pointer shadow-sm shadow-orange-500/10 font-semibold"
                  >
                    {isEditMode ? 'Save Changes' : 'Add Model'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => { resetManualForm(); setShowAddModal(false); }}
                    className="text-xs bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer animate-none"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
  );
}
