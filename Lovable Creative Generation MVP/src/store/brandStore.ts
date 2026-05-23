import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BrandKit {
  dealershipName: string;
  logo: string; // data URL
  oemLogo: string; // OEM/manufacturer logo data URL (optional)
  primaryHex: string;
  accentHex: string;
  displayFont: string;
  bodyFont: string;
  phone: string;
  address: string;
  footerEnabled: boolean;
  phoneNumber: string;
  locations: string;
  socialHandle: string;
}

const defaultKit: BrandKit = {
  dealershipName: 'Apex Motors',
  logo: '',
  oemLogo: '',
  primaryHex: '#FF6A2C',
  accentHex: '#1B1B2F',
  displayFont: 'Bebas Neue',
  bodyFont: 'Inter',
  phone: '+91 98765 43210',
  address: 'MG Road, Bengaluru',
  footerEnabled: true,
  phoneNumber: '',
  locations: '',
  socialHandle: '',
};

interface BrandStore {
  brandKit: BrandKit;
  setBrandKit: (patch: Partial<BrandKit>) => void;
  reset: () => void;
}

export const useBrandStore = create<BrandStore>()(
  persist(
    (set, get) => ({
      brandKit: defaultKit,
      setBrandKit: (patch) => set({ brandKit: { ...get().brandKit, ...patch } }),
      reset: () => set({ brandKit: defaultKit }),
    }),
    { name: 'social-saas-brand-store' }
  )
);