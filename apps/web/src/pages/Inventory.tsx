import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Search, Filter, MoreHorizontal, PlusSquare, CheckSquare, Pencil, Trash2, Zap, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { inventoryService } from '../services/creative';

type VehicleStatus = 'in_stock' | 'sold' | 'reserved';
type Condition = 'new' | 'used';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  price: number;
  condition: Condition;
  color: string;
  fuel_type: string;
  stock_count: number;
  status: VehicleStatus;
  image_url: string;
}


const STATUS_STYLES: Record<VehicleStatus, string> = {
  in_stock: 'bg-green-100 text-green-700',
  sold: 'bg-gray-100 text-gray-500',
  reserved: 'bg-yellow-100 text-yellow-700',
};

const STATUS_LABELS: Record<VehicleStatus, string> = {
  in_stock: 'In Stock',
  sold: 'Sold',
  reserved: 'Reserved',
};

function formatPrice(p: number) {
  if (p >= 100000) return `₹${(p / 100000).toFixed(2)} L`;
  return `₹${p.toLocaleString('en-IN')}`;
}

const GRADIENTS = [
  'from-blue-900 to-blue-700', 'from-gray-700 to-gray-500', 'from-red-700 to-red-500',
  'from-indigo-800 to-indigo-600', 'from-slate-600 to-slate-400', 'from-rose-700 to-rose-500',
  'from-amber-700 to-amber-500', 'from-zinc-600 to-zinc-400', 'from-teal-700 to-teal-500',
];

function makeGradient(make: string) {
  const idx = make.charCodeAt(0) % GRADIENTS.length;
  return GRADIENTS[idx] ?? GRADIENTS[0]!;
}

const FUEL_TYPES = ['Petrol', 'Diesel', 'Electric', 'CNG', 'Hybrid'];
const EMPTY_FORM = {
  make: '', model: '', variant: '', year: new Date().getFullYear(),
  price: 0, condition: 'new' as Condition, color: '', fuel_type: '', stock_count: 1,
};

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          cell += '"';
          i++; // Skip double quote
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(cell.trim());
        cell = '';
      } else if (char === '\n' || char === '\r') {
        row.push(cell.trim());
        cell = '';
        if (row.length > 0 && row.some(c => c !== '')) {
          lines.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip newline
        }
      } else {
        cell += char;
      }
    }
  }
  
  if (cell || row.length > 0) {
    row.push(cell.trim());
    if (row.length > 0 && row.some(c => c !== '')) {
      lines.push(row);
    }
  }

  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].map(h => h.trim());
  const rows = lines.slice(1);
  return { headers, rows };
}

export default function InventoryPage() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState('');
  const [filterCondition, setFilterCondition] = useState<'all' | Condition>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | VehicleStatus>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStep, setUploadStep] = useState<'drop' | 'mapping' | 'confirm'>('drop');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CSV Import States
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Array<{ row: number; field: string; message: string }>>([]);
  const [validationWarnings, setValidationWarnings] = useState<Array<{ row: number; field: string; message: string }>>([]);
  const [parsedItems, setParsedItems] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_FORM);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const { addToast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        const { headers, rows } = parseCsv(text);
        if (headers.length === 0) {
          addToast({ type: 'error', title: 'Empty File', message: 'The CSV file appears to be empty.' });
          return;
        }
        setCsvHeaders(headers);
        setCsvRows(rows);
        
        // Auto-detect mappings based on header names
        const initialMapping: Record<string, string> = {};
        const targets = [
          { key: 'make', terms: ['make', 'brand', 'company', 'manufacturer'] },
          { key: 'model', terms: ['model', 'name'] },
          { key: 'variant', terms: ['variant', 'trim', 'version'] },
          { key: 'year', terms: ['year', 'mfg', 'manufacture'] },
          { key: 'price', terms: ['price', 'cost', 'selling'] },
          { key: 'condition', terms: ['condition', 'new/used', 'status_new'] },
          { key: 'color', terms: ['color', 'colour'] },
          { key: 'fuel_type', terms: ['fuel', 'type'] },
          { key: 'transmission', terms: ['transmission', 'gear'] },
          { key: 'mileage_km', terms: ['mileage', 'km', 'kms', 'odometer'] },
          { key: 'stock_count', terms: ['stock', 'qty', 'quantity', 'count'] },
        ];

        targets.forEach((target) => {
          const found = headers.find((h) =>
            target.terms.some((term) => h.toLowerCase().includes(term))
          );
          initialMapping[target.key] = found || '';
        });

        setColumnMapping(initialMapping);
        setUploadStep('mapping');
      }
    };
    reader.readAsText(file);
  };

  const handleValidate = () => {
    const errors: Array<{ row: number; field: string; message: string }> = [];
    const warnings: Array<{ row: number; field: string; message: string }> = [];
    const itemsToInsert: any[] = [];

    if (csvRows.length === 0) {
      addToast({ type: 'error', title: 'No Data', message: 'No rows found to validate.' });
      return;
    }

    csvRows.forEach((row, idx) => {
      const rowNum = idx + 2; // index 0 is row 2 in csv file
      
      const getValue = (fieldKey: string) => {
        const csvColName = columnMapping[fieldKey];
        if (!csvColName) return undefined;
        const colIdx = csvHeaders.indexOf(csvColName);
        return colIdx !== -1 ? row[colIdx] : undefined;
      };

      const make = getValue('make')?.trim();
      const model = getValue('model')?.trim();
      const variant = getValue('variant')?.trim();
      const yearStr = getValue('year')?.trim();
      const priceStr = getValue('price')?.trim();
      const conditionStr = getValue('condition')?.trim()?.toLowerCase();
      const color = getValue('color')?.trim();
      const fuelType = getValue('fuel_type')?.trim();
      const transmission = getValue('transmission')?.trim();
      const mileageStr = getValue('mileage_km')?.trim();
      const stockStr = getValue('stock_count')?.trim();

      // Validations
      if (!make) {
        errors.push({ row: rowNum, field: 'Make', message: 'Make/Brand is required.' });
      }
      if (!model) {
        errors.push({ row: rowNum, field: 'Model', message: 'Model is required.' });
      }

      let year = 0;
      if (!yearStr) {
        errors.push({ row: rowNum, field: 'Year', message: 'Year is required.' });
      } else {
        year = Number(yearStr);
        if (isNaN(year) || year < 1980 || year > new Date().getFullYear() + 1) {
          errors.push({ row: rowNum, field: 'Year', message: `Year must be a number between 1980 and ${new Date().getFullYear() + 1}.` });
        }
      }

      let price = 0;
      if (!priceStr) {
        errors.push({ row: rowNum, field: 'Price', message: 'Price is required.' });
      } else {
        price = Number(priceStr);
        if (isNaN(price) || price < 0) {
          errors.push({ row: rowNum, field: 'Price', message: 'Price must be a valid positive number.' });
        }
      }

      // Warnings / Defaults
      let condition: 'new' | 'used' = 'used';
      if (conditionStr) {
        if (conditionStr.includes('new') || conditionStr === 'n') {
          condition = 'new';
        } else if (conditionStr.includes('used') || conditionStr.includes('pre') || conditionStr === 'u') {
          condition = 'used';
        } else {
          warnings.push({ row: rowNum, field: 'Condition', message: `Invalid value "${conditionStr}". Defaulted to "used".` });
        }
      } else {
        warnings.push({ row: rowNum, field: 'Condition', message: 'Missing. Defaulted to "used".' });
      }

      let stockCount = 1;
      if (stockStr) {
        const parsedStock = Number(stockStr);
        if (!isNaN(parsedStock) && parsedStock >= 0) {
          stockCount = Math.floor(parsedStock);
        } else {
          warnings.push({ row: rowNum, field: 'Stock Count', message: 'Invalid value. Defaulted to 1.' });
        }
      }

      let mileageKm: number | undefined = undefined;
      if (mileageStr) {
        const parsedMileage = Number(mileageStr);
        if (!isNaN(parsedMileage) && parsedMileage >= 0) {
          mileageKm = Math.floor(parsedMileage);
        } else {
          warnings.push({ row: rowNum, field: 'Mileage', message: 'Invalid value. Left empty.' });
        }
      }

      if (!color) {
        warnings.push({ row: rowNum, field: 'Color', message: 'Color is missing.' });
      }
      if (!fuelType) {
        warnings.push({ row: rowNum, field: 'Fuel Type', message: 'Fuel Type is missing.' });
      }

      itemsToInsert.push({
        make: make || '',
        model: model || '',
        variant: variant || null,
        year,
        price,
        condition,
        color: color || null,
        fuel_type: fuelType || null,
        transmission: transmission || null,
        mileage_km: mileageKm || null,
        stock_count: stockCount,
        status: 'in_stock',
        source: 'csv',
      });
    });

    setValidationErrors(errors);
    setValidationWarnings(warnings);
    setParsedItems(itemsToInsert);
    setUploadStep('confirm');
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await inventoryService.batch(parsedItems);
      if (res.success) {
        addToast({ type: 'success', title: 'Import Complete', message: `Successfully imported ${res.count} vehicles!` });
        // Reload vehicles
        const listRes = await inventoryService.list({ pageSize: 100 });
        const mapped = listRes.items.map((item) => ({
          id: item.id,
          make: item.make,
          model: item.model,
          variant: item.variant ?? '',
          year: item.year,
          price: item.price,
          condition: item.condition,
          color: item.color ?? '',
          fuel_type: item.fuelType ?? '',
          stock_count: item.stockCount,
          status: item.status,
          image_url: makeGradient(item.make),
        }));
        setVehicles(mapped);
        setShowUploadModal(false);
      }
    } catch (err: any) {
      console.error(err);
      addToast({ type: 'error', title: 'Import Failed', message: err.response?.data?.error?.message || 'Failed to import inventory batch' });
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    inventoryService.list({ pageSize: 100 }).then((res) => {
      const mapped: Vehicle[] = res.items.map((item) => ({
        id: item.id,
        make: item.make,
        model: item.model,
        variant: item.variant ?? '',
        year: item.year,
        price: item.price,
        condition: item.condition,
        color: item.color ?? '',
        fuel_type: item.fuelType ?? '',
        stock_count: item.stockCount,
        status: item.status,
        image_url: makeGradient(item.make),
      }));
      setVehicles(mapped);
    }).catch(console.error);
  }, []);

  const filtered = vehicles.filter((v) => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${v.make} ${v.model} ${v.variant}`.toLowerCase().includes(q);
    const matchCond = filterCondition === 'all' || v.condition === filterCondition;
    const matchStat = filterStatus === 'all' || v.status === filterStatus;
    return matchSearch && matchCond && matchStat;
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const markSold = (id: string) => {
    inventoryService.markSold(id).catch(console.error);
    setVehicles((prev) => prev.map((v) => v.id === id ? { ...v, status: 'sold' } : v));
  };

  const deleteVehicle = (id: string) => {
    inventoryService.delete(id).catch(console.error);
    setVehicles((prev) => prev.filter((v) => v.id !== id));
  };

  const openAdd = () => {
    setEditingVehicle(null);
    setVehicleForm(EMPTY_FORM);
    setShowVehicleModal(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditingVehicle(v);
    setVehicleForm({ make: v.make, model: v.model, variant: v.variant, year: v.year, price: v.price, condition: v.condition, color: v.color, fuel_type: v.fuel_type, stock_count: v.stock_count });
    setShowVehicleModal(true);
  };

  const setField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setVehicleForm((prev) => ({ ...prev, [key]: value }));

  const handleVehicleSave = async () => {
    if (!vehicleForm.make || !vehicleForm.model) return;
    setVehicleSaving(true);
    try {
      const payload = {
        make: vehicleForm.make,
        model: vehicleForm.model,
        variant: vehicleForm.variant || undefined,
        year: vehicleForm.year,
        price: vehicleForm.price,
        condition: vehicleForm.condition,
        color: vehicleForm.color || undefined,
        fuelType: vehicleForm.fuel_type || undefined,
        stockCount: vehicleForm.stock_count,
        imageUrls: [],
        status: 'in_stock' as const,
        source: 'manual' as const,
      };
      if (editingVehicle) {
        await inventoryService.update(editingVehicle.id, payload);
        setVehicles((prev) => prev.map((v) => v.id === editingVehicle.id
          ? { ...v, ...vehicleForm, image_url: makeGradient(vehicleForm.make) }
          : v));
      } else {
        const res = await inventoryService.create({ dealerId: '', ...payload });
        const item = res.item;
        setVehicles((prev) => [...prev, {
          id: item.id, make: item.make, model: item.model, variant: item.variant ?? '',
          year: item.year, price: item.price, condition: item.condition,
          color: item.color ?? '', fuel_type: item.fuelType ?? '',
          stock_count: item.stockCount, status: item.status,
          image_url: makeGradient(item.make),
        }]);
      }
      setShowVehicleModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setVehicleSaving(false);
    }
  };

  const bulkMarkSold = async () => {
    const ids = [...selected];
    await Promise.allSettled(ids.map((id) => inventoryService.markSold(id)));
    setVehicles((prev) => prev.map((v) => selected.has(v.id) ? { ...v, status: 'sold' } : v));
    setSelected(new Set());
    addToast({ type: 'success', title: `${ids.length} vehicle${ids.length > 1 ? 's' : ''} marked as sold` });
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    await Promise.allSettled(ids.map((id) => inventoryService.delete(id)));
    setVehicles((prev) => prev.filter((v) => !selected.has(v.id)));
    setSelected(new Set());
    addToast({ type: 'success', title: `${ids.length} vehicle${ids.length > 1 ? 's' : ''} deleted` });
  };

  const bulkGeneratePost = () => {
    const names = vehicles.filter((v) => selected.has(v.id)).map((v) => `${v.make} ${v.model}`).join(', ');
    navigate(`/create?prompt=Showcase+these+vehicles+for+sale:+${encodeURIComponent(names)}`);
    setSelected(new Set());
  };

  const inStock = vehicles.filter((v) => v.status === 'in_stock').length;
  const sold = vehicles.filter((v) => v.status === 'sold').length;
  const newCount = vehicles.filter((v) => v.condition === 'new').length;
  const usedCount = vehicles.filter((v) => v.condition === 'used').length;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Inventory</h2>
          <p className="text-sm text-gray-500 mt-0.5">{inStock} in stock · {sold} sold · {newCount} new · {usedCount} used</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="text-sm flex items-center gap-1.5" onClick={() => { setShowUploadModal(true); setUploadStep('drop'); }}>
            <Upload className="w-4 h-4" /> Import CSV
          </Button>
          <Button className="text-sm flex items-center gap-1.5" onClick={openAdd}>
            <PlusSquare className="w-4 h-4" /> Add Vehicle
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by make, model, variant..."
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-1.5 border rounded-lg p-1">
          <Filter className="w-3.5 h-3.5 text-gray-400 ml-1" />
          {(['all', 'new', 'used'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setFilterCondition(c)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${filterCondition === c ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 border rounded-lg p-1">
          {(['all', 'in_stock', 'reserved', 'sold'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${filterStatus === s ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {s === 'all' ? 'All Status' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-blue-700">{selected.size} selected</span>
          <button onClick={bulkMarkSold} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Mark Sold</button>
          <button onClick={bulkGeneratePost} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Generate Showcase Post</button>
          <button onClick={bulkDelete} className="text-xs text-red-500 hover:text-red-600 font-medium">Delete</button>
          <button className="ml-auto text-xs text-gray-500" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={() => {
                      if (selected.size === filtered.length) setSelected(new Set());
                      else setSelected(new Set(filtered.map((v) => v.id)));
                    }}
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vehicle</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Condition</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((v) => (
                <tr key={v.id} className={`hover:bg-gray-50 transition-colors ${selected.has(v.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" className="rounded" checked={selected.has(v.id)} onChange={() => toggleSelect(v.id)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-9 rounded-lg bg-gradient-to-br ${v.image_url} flex-shrink-0`} />
                      <div>
                        <p className="font-semibold text-gray-900">{v.make} {v.model}</p>
                        <p className="text-xs text-gray-500">{v.variant} · {v.year} · {v.color}</p>
                        <p className="text-xs text-gray-400">{v.fuel_type}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${v.condition === 'new' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                      {v.condition === 'new' ? 'New' : 'Used'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{formatPrice(v.price)}</td>
                  <td className="px-4 py-3 text-gray-600">{v.stock_count} unit{v.stock_count !== 1 ? 's' : ''}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[v.status]}`}>
                      {STATUS_LABELS[v.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        title="Generate Post"
                        onClick={() => {
                          const p = `${v.condition === 'new' ? 'New arrival' : 'Pre-owned'}: ${v.year} ${v.make} ${v.model}${v.variant ? ' ' + v.variant : ''} — ${formatPrice(v.price)}. ${v.stock_count} unit${v.stock_count !== 1 ? 's' : ''} available${v.color ? ', ' + v.color : ''}.`;
                          navigate('/create?prompt=' + encodeURIComponent(p));
                        }}
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                      <button title="Edit" onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {v.status !== 'sold' && (
                        <button title="Mark as Sold" onClick={() => markSold(v.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors">
                          <CheckSquare className="w-4 h-4" />
                        </button>
                      )}
                      <button title="Delete" onClick={() => deleteVehicle(v.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                    <div className="text-4xl mb-2">🚗</div>
                    <p className="font-medium text-gray-500">No vehicles found</p>
                    <p className="text-sm mt-1">Try adjusting filters or import a CSV</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t flex items-center justify-between text-xs text-gray-500">
          <span>Showing {filtered.length} of {vehicles.length} vehicles</span>
          <div className="flex gap-1">
            <button className="px-2 py-1 rounded border hover:bg-gray-50">Prev</button>
            <button className="px-2 py-1 rounded border bg-blue-600 text-white">1</button>
            <button className="px-2 py-1 rounded border hover:bg-gray-50">Next</button>
          </div>
        </div>
      </div>

      {/* Add / Edit Vehicle Modal */}
      {showVehicleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</h3>
              <button onClick={() => setShowVehicleModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Make <span className="text-red-500">*</span></label>
                <input
                  value={vehicleForm.make}
                  onChange={(e) => setField('make', e.target.value)}
                  placeholder="e.g. Hyundai"
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Model <span className="text-red-500">*</span></label>
                <input
                  value={vehicleForm.model}
                  onChange={(e) => setField('model', e.target.value)}
                  placeholder="e.g. Creta"
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-medium text-gray-700">Variant</label>
                <input
                  value={vehicleForm.variant}
                  onChange={(e) => setField('variant', e.target.value)}
                  placeholder="e.g. SX(O) Turbo"
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Year <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={vehicleForm.year}
                  onChange={(e) => setField('year', Number(e.target.value))}
                  min={1980} max={new Date().getFullYear() + 1}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Price (₹) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={vehicleForm.price}
                  onChange={(e) => setField('price', Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Condition <span className="text-red-500">*</span></label>
                <select
                  value={vehicleForm.condition}
                  onChange={(e) => setField('condition', e.target.value as Condition)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="new">New</option>
                  <option value="used">Used</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Fuel Type</label>
                <select
                  value={vehicleForm.fuel_type}
                  onChange={(e) => setField('fuel_type', e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Color</label>
                <input
                  value={vehicleForm.color}
                  onChange={(e) => setField('color', e.target.value)}
                  placeholder="e.g. Pearl White"
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Stock Count <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={vehicleForm.stock_count}
                  onChange={(e) => setField('stock_count', Number(e.target.value))}
                  min={0}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="secondary" className="flex-1 text-sm" onClick={() => setShowVehicleModal(false)}>Cancel</Button>
              <Button
                className="flex-1 text-sm"
                onClick={handleVehicleSave}
                disabled={vehicleSaving || !vehicleForm.make || !vehicleForm.model}
              >
                {vehicleSaving ? 'Saving...' : editingVehicle ? 'Save Changes' : 'Add Vehicle'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Import Inventory</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {['Upload File', 'Map Columns', 'Confirm'].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === (['drop','mapping','confirm'] as const).indexOf(uploadStep) ? 'bg-blue-600 text-white' :
                    i < (['drop','mapping','confirm'] as const).indexOf(uploadStep) ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                  }`}>{i + 1}</div>
                  <span className="text-xs text-gray-500">{s}</span>
                  {i < 2 && <div className="w-6 h-px bg-gray-200" />}
                </div>
              ))}
            </div>

            {uploadStep === 'drop' && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files?.[0]; if (file) processFile(file); }}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-700">Drop CSV file here</p>
                <p className="text-sm text-gray-400 mt-1">or click to browse</p>
                <p className="text-xs text-gray-300 mt-3">Supports .csv · Max 500 rows</p>
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
              </div>
            )}

            {uploadStep === 'mapping' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Map your file columns to Cardeko fields:</p>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {[
                    { key: 'make', label: 'Make / Brand', required: true },
                    { key: 'model', label: 'Model', required: true },
                    { key: 'variant', label: 'Variant', required: false },
                    { key: 'year', label: 'Year', required: true },
                    { key: 'price', label: 'Price', required: true },
                    { key: 'condition', label: 'Condition', required: false },
                    { key: 'color', label: 'Color', required: false },
                    { key: 'fuel_type', label: 'Fuel Type', required: false },
                    { key: 'transmission', label: 'Transmission', required: false },
                    { key: 'mileage_km', label: 'Mileage (KM)', required: false },
                    { key: 'stock_count', label: 'Stock Count', required: false },
                  ].map((m) => (
                    <div key={m.key} className="flex items-center gap-3">
                      <div className="w-32 text-xs font-semibold text-gray-700">
                        {m.label} {m.required && <span className="text-red-500">*</span>}
                      </div>
                      <select
                        value={columnMapping[m.key] || ''}
                        onChange={(e) => setColumnMapping(prev => ({ ...prev, [m.key]: e.target.value }))}
                        className="flex-1 text-xs border rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Skip / Default --</option>
                        {csvHeaders.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Data Preview */}
                <div className="border rounded-xl p-3 bg-gray-50 space-y-2">
                  <span className="text-xs font-bold text-gray-700 block">Sample Data Preview (First 3 Rows)</span>
                  <div className="overflow-x-auto text-[11px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b text-gray-400 font-semibold">
                          <th className="pb-1 pr-2">Make</th>
                          <th className="pb-1 pr-2">Model</th>
                          <th className="pb-1 pr-2">Year</th>
                          <th className="pb-1 pr-2">Price</th>
                          <th className="pb-1 pr-2">Cond.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {csvRows.slice(0, 3).map((row, idx) => {
                          const getValue = (fieldKey: string) => {
                            const colName = columnMapping[fieldKey];
                            if (!colName) return '-';
                            const colIdx = csvHeaders.indexOf(colName);
                            return colIdx !== -1 ? row[colIdx] || '-' : '-';
                          };
                          return (
                            <tr key={idx} className="text-gray-600">
                              <td className="py-1 pr-2 truncate max-w-[80px]">{getValue('make')}</td>
                              <td className="py-1 pr-2 truncate max-w-[80px]">{getValue('model')}</td>
                              <td className="py-1 pr-2">{getValue('year')}</td>
                              <td className="py-1 pr-2">{getValue('price')}</td>
                              <td className="py-1 pr-2">{getValue('condition')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1 text-sm" onClick={() => setUploadStep('drop')}>Back</Button>
                  <Button className="flex-1 text-sm bg-blue-600 hover:bg-blue-700" onClick={handleValidate}>Validate</Button>
                </div>
              </div>
            )}

            {uploadStep === 'confirm' && (
              <div className="space-y-4">
                <div className={`border rounded-xl p-4 ${validationErrors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                  <p className={`font-bold ${validationErrors.length > 0 ? 'text-red-800' : 'text-green-800'}`}>
                    {validationErrors.length > 0 ? 'Validation Failed' : 'Ready to Import'}
                  </p>
                  <p className={`text-sm mt-1 ${validationErrors.length > 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {parsedItems.length} rows processed · {validationErrors.length} errors · {validationWarnings.length} warnings
                  </p>
                </div>

                {validationErrors.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-red-600 block">Critical Errors (Must be fixed):</span>
                    <div className="max-h-40 overflow-y-auto border border-red-100 rounded-lg p-2.5 bg-red-50/50 space-y-1 text-xs">
                      {validationErrors.map((err, i) => (
                        <div key={i} className="text-red-700">
                          <strong>Row {err.row} ({err.field}):</strong> {err.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {validationWarnings.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-yellow-600 block">Warnings (Import will continue with defaults):</span>
                    <div className="max-h-40 overflow-y-auto border border-yellow-100 rounded-lg p-2.5 bg-yellow-50/50 space-y-1 text-xs">
                      {validationWarnings.map((warn, i) => (
                        <div key={i} className="text-yellow-700">
                          <strong>Row {warn.row} ({warn.field}):</strong> {warn.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1 text-sm" onClick={() => setUploadStep('mapping')}>Back</Button>
                  <Button
                    className="flex-1 text-sm bg-blue-600 hover:bg-blue-700"
                    disabled={validationErrors.length > 0 || importing}
                    onClick={handleImport}
                  >
                    {importing ? 'Importing...' : `Confirm Import (${parsedItems.length - validationErrors.length} vehicles)`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
