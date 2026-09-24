import { Check, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { creativeService } from '../../services/creative';
import { BRANDS } from '../../utils/settings';
import type { ProfileForm } from './useProfileForm';

// Moved unchanged from SettingsPage.tsx; Task 7 ports it to the reference layout.
export function ProfileTab({ form }: { form: ProfileForm }) {
  const { addToast } = useToast();
  const {
    dealerName, setDealerName, showroomType, setShowroomType, city, setCity, phone, setPhone, whatsapp, setWhatsapp,
    selectedBrands, toggleBrand, logoUrl, setLogoUrl, uploadingLogo, setUploadingLogo, address, setAddress,
    font, setFont, primaryColor, setPrimaryColor, saved, handleSave, profileLoaded,
  } = form;

  return (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <h3 className="font-semibold text-slate-800 text-sm">Dealership Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dealership Name</label>
                <input value={dealerName} onChange={(e) => setDealerName(e.target.value)} placeholder="e.g. Sharma Motors Pvt. Ltd." className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Showroom Type</label>
                <select 
                  value={showroomType} 
                  onChange={(e) => setShowroomType(e.target.value)} 
                  className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                >
                  <option value="new">New Cars Showroom</option>
                  <option value="pre-owned">True Value / Certified Used Cars</option>
                  <option value="multi-brand">Multi-brand Car Dealership</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Pune" className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Contact Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">WhatsApp Number</label>
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+91 XXXXX XXXXX" className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Brands Sold</label>
              <div className="flex flex-wrap gap-2">
                {BRANDS.map((b) => (
                  <button
                    key={b}
                    onClick={() => toggleBrand(b)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer font-medium ${
                      selectedBrands.includes(b) 
                        ? 'bg-orange-500 text-white border-orange-500 shadow-sm' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-orange-500 hover:text-orange-600'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Dealer Logo</label>
              <div className="flex items-center gap-4">
                {logoUrl ? (
                  <div className="relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
                    <img src={logoUrl} alt="Dealer Logo" className="object-contain max-w-full max-h-full" />
                    <button
                      type="button"
                      onClick={() => setLogoUrl("")}
                      className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 hover:bg-red-650 rounded-full text-white cursor-pointer animate-none"
                      title="Remove Logo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-50/50 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs">
                    No Logo
                  </div>
                )}
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    id="logo-upload-input"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingLogo(true);
                      try {
                        const res = await creativeService.uploadImage(file);
                        setLogoUrl(res.url);
                        addToast({ type: 'success', title: 'Logo Uploaded', message: 'Logo uploaded successfully. Remember to save changes!' });
                      } catch (err) {
                        addToast({ type: 'error', title: 'Upload Failed', message: 'Failed to upload logo image.' });
                        console.error(err);
                      } finally {
                        setUploadingLogo(false);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-sm border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                    disabled={uploadingLogo}
                    onClick={() => document.getElementById("logo-upload-input")?.click()}
                  >
                    {uploadingLogo ? "Uploading..." : "Upload Logo"}
                  </Button>
                  <p className="text-[10px] text-slate-500 mt-1">PNG or JPG recommended (transparent background preferred)</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Showroom Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="Enter detailed showroom address (e.g. Plot No 12, Outer Ring Road, Bangalore)"
                className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">This address will be rendered at the bottom panel of generated creatives.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Brand Font Family</label>
              <select
                value={font}
                onChange={(e) => setFont(e.target.value)}
                className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                <option value="Arial" className="bg-white">Arial (Standard Clean)</option>
                <option value="Helvetica" className="bg-white">Helvetica (Modern Neue)</option>
                <option value="Georgia" className="bg-white">Georgia (Classic Serif)</option>
                <option value="Impact" className="bg-white">Impact (Heavy Title / Bold)</option>
                <option value="Trebuchet MS" className="bg-white">Trebuchet MS (Friendly Sans)</option>
                <option value="Courier New" className="bg-white">Courier New (Technical Monospace)</option>
              </select>
              <p className="text-[10px] text-slate-500 mt-1">Used for rendering headings and text overlays on your dealership creatives.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Brand Colors</label>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Primary</p>
                  <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-12 h-10 rounded-lg border border-slate-200 bg-white cursor-pointer" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Secondary</p>
                  <input type="color" defaultValue="#1A1A2E" className="w-12 h-10 rounded-lg border border-slate-200 bg-white cursor-pointer" />
                </div>
                <p className="text-xs text-slate-500">Used on all generated creatives and templates</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            {saved && (
              <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
                <Check className="w-4 h-4" /> Saved successfully
              </div>
            )}
            <Button onClick={handleSave} disabled={!profileLoaded} className="text-sm bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 cursor-pointer">Save Changes</Button>
          </div>
        </div>
  );
}
