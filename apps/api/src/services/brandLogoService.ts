/**
 * Brand Logo Service
 * Provides vector SVG logos for popular car brands in India.
 * Each SVG is sized to fit within a standard container (typically width 200, height 60).
 */

export function getBrandLogoSvg(brandName: string, accentColor: string = "#ffffff"): string {
  const name = brandName.trim().toLowerCase();

  // Return clean, crisp vector SVGs for each major brand.
  // ViewBox is standardized to 200x60 for consistent compositing.

  if (name.includes("maruti") || name.includes("suzuki")) {
    return `<svg viewBox="0 0 200 60" width="200" height="60" xmlns="http://www.w3.org/2000/svg">
      <!-- Suzuki stylized 'S' + Maruti text -->
      <g transform="translate(10, 10)">
        <path d="M14.5 2.5 C10.5 2.5, 4.5 6.5, 2.5 12.5 C0.5 18.5, 0.5 26.5, 4.5 32.5 C8.5 38.5, 22.5 37.5, 26.5 33.5 C30.5 29.5, 30.5 21.5, 26.5 15.5 C24.5 12.5, 18.5 12.5, 14.5 15.5 C12.5 17.5, 12.5 22.5, 16.5 22.5 C20.5 22.5, 20.5 17.5, 18.5 15.5" fill="none" stroke="${accentColor}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4.5 32.5 L26.5 7.5" stroke="${accentColor}" stroke-width="4.5" stroke-linecap="round"/>
      </g>
      <text x="60" y="36" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="900" fill="${accentColor}" letter-spacing="1">MARUTI SUZUKI</text>
    </svg>`;
  }

  if (name.includes("hyundai")) {
    return `<svg viewBox="0 0 200 60" width="200" height="60" xmlns="http://www.w3.org/2000/svg">
      <!-- Hyundai oval 'H' logo + text -->
      <ellipse cx="30" cy="30" rx="22" ry="15" fill="none" stroke="${accentColor}" stroke-width="3"/>
      <path d="M22 20 L22 40 M38 20 L38 40 M22 30 L38 30" stroke="${accentColor}" stroke-width="4" stroke-linecap="round"/>
      <text x="65" y="36" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="${accentColor}" letter-spacing="1.5">HYUNDAI</text>
    </svg>`;
  }

  if (name.includes("tata")) {
    return `<svg viewBox="0 0 200 60" width="200" height="60" xmlns="http://www.w3.org/2000/svg">
      <!-- TATA oval emblem + text -->
      <ellipse cx="30" cy="30" rx="20" ry="20" fill="none" stroke="${accentColor}" stroke-width="3"/>
      <path d="M20 22 C20 22, 30 16, 40 22 M30 18 L30 42 M20 40 L40 40" fill="none" stroke="${accentColor}" stroke-width="3.5" stroke-linecap="round"/>
      <text x="65" y="37" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" fill="${accentColor}" letter-spacing="3">TATA</text>
    </svg>`;
  }

  if (name.includes("honda")) {
    return `<svg viewBox="0 0 200 60" width="200" height="60" xmlns="http://www.w3.org/2000/svg">
      <!-- Honda trapezoidal 'H' + text -->
      <path d="M12 12 L48 12 L44 48 L16 48 Z" fill="none" stroke="${accentColor}" stroke-width="3"/>
      <path d="M22 18 L22 42 M38 18 L38 42 M22 28 L38 28" stroke="${accentColor}" stroke-width="4" stroke-linecap="round"/>
      <text x="65" y="37" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="${accentColor}" letter-spacing="2">HONDA</text>
    </svg>`;
  }

  if (name.includes("toyota")) {
    return `<svg viewBox="0 0 200 60" width="200" height="60" xmlns="http://www.w3.org/2000/svg">
      <!-- Toyota triple-oval logo + text -->
      <ellipse cx="30" cy="30" rx="22" ry="16" fill="none" stroke="${accentColor}" stroke-width="2.5"/>
      <ellipse cx="30" cy="24" rx="14" ry="9" fill="none" stroke="${accentColor}" stroke-width="2.5"/>
      <ellipse cx="30" cy="30" rx="5" ry="15" fill="none" stroke="${accentColor}" stroke-width="2.5"/>
      <text x="65" y="37" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="900" fill="${accentColor}" letter-spacing="2">TOYOTA</text>
    </svg>`;
  }

  if (name.includes("kia")) {
    return `<svg viewBox="0 0 200 60" width="200" height="60" xmlns="http://www.w3.org/2000/svg">
      <!-- KIA new wordmark -->
      <g transform="translate(10, 15)">
        <path d="M10 5 L20 25 L30 5 M22 15 L10 15" stroke="${accentColor}" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
        <path d="M40 5 L40 25" stroke="${accentColor}" stroke-width="5" stroke-linecap="square" fill="none"/>
        <path d="M50 25 L60 5 L70 25 M53 18 L67 18" stroke="${accentColor}" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter" fill="none"/>
      </g>
      <text x="95" y="36" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="900" fill="${accentColor}" letter-spacing="4">MOTORS</text>
    </svg>`;
  }

  if (name.includes("mahindra")) {
    return `<svg viewBox="0 0 200 60" width="200" height="60" xmlns="http://www.w3.org/2000/svg">
      <!-- Mahindra twin peaks logo + text -->
      <g transform="translate(10, 12)" stroke="${accentColor}" stroke-width="3" fill="none">
        <path d="M5 25 L20 5 L35 25" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M12 25 L20 12 L28 25" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M20 5 L20 30" stroke-linecap="round"/>
      </g>
      <text x="58" y="37" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="900" fill="${accentColor}" letter-spacing="1.5">Mahindra</text>
    </svg>`;
  }

  // Generic fallback if the brand is not matched or generic
  const uppercaseBrand = brandName.toUpperCase();
  return `<svg viewBox="0 0 200 60" width="200" height="60" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="10" width="40" height="40" rx="8" fill="none" stroke="${accentColor}" stroke-width="3"/>
    <text x="25" y="35" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="${accentColor}" text-anchor="middle" dominant-baseline="middle">${uppercaseBrand[0] || 'C'}</text>
    <text x="60" y="36" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="bold" fill="${accentColor}" letter-spacing="1">${uppercaseBrand.slice(0, 12)}</text>
  </svg>`;
}
