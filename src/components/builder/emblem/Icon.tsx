// Inline stroke icons, currentColor.
import type { CSSProperties } from 'react';
import type { IconName } from './data';

type Props = {
  name: IconName;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
  className?: string;
};

export default function Icon({ name, size = 20, stroke = 1.7, style, className }: Props) {
  const p = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const map: Record<IconName, JSX.Element> = {
    upload:  <><path {...p} d="M12 16V4" /><path {...p} d="M7 9l5-5 5 5" /><path {...p} d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></>,
    camera:  <><path {...p} d="M3 8a2 2 0 012-2h2l1.5-2h7L18 6h1a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><circle {...p} cx="12" cy="12.5" r="3.5" /></>,
    sparkle: <><path {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path {...p} d="M18.5 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></>,
    check:   <path {...p} d="M4 12.5l5 5L20 6.5" />,
    chevR:   <path {...p} d="M9 5l7 7-7 7" />,
    chevL:   <path {...p} d="M15 5l-7 7 7 7" />,
    chevD:   <path {...p} d="M5 9l7 7 7-7" />,
    plus:    <><path {...p} d="M12 5v14" /><path {...p} d="M5 12h14" /></>,
    minus:   <path {...p} d="M5 12h14" />,
    cart:    <><circle {...p} cx="9" cy="20" r="1.4" /><circle {...p} cx="18" cy="20" r="1.4" /><path {...p} d="M3 4h2l2.4 12.3a1 1 0 001 .8h8.7a1 1 0 001-.8L21 8H6" /></>,
    nfc:     <><path {...p} d="M7 8c-1.5 1.2-2.5 2.6-2.5 4s1 2.8 2.5 4" /><path {...p} d="M10.5 6.5C8.5 8 7 9.9 7 12s1.5 4 3.5 5.5" /><path {...p} d="M14 6v12" /></>,
    image:   <><rect {...p} x="3" y="4" width="18" height="16" rx="2.5" /><circle {...p} cx="9" cy="9.5" r="1.6" /><path {...p} d="M4 17l4.5-4.5 3 3L16 11l4 5" /></>,
    layers:  <><path {...p} d="M12 3l8 4.5-8 4.5-8-4.5z" /><path {...p} d="M4 12l8 4.5 8-4.5" /><path {...p} d="M4 16.5L12 21l8-4.5" /></>,
    grid:    <><rect {...p} x="4" y="4" width="7" height="7" rx="1.6" /><rect {...p} x="13" y="4" width="7" height="7" rx="1.6" /><rect {...p} x="4" y="13" width="7" height="7" rx="1.6" /><rect {...p} x="13" y="13" width="7" height="7" rx="1.6" /></>,
    poster:  <><rect {...p} x="5" y="3" width="14" height="18" rx="1.6" /><path {...p} d="M8 14l3-3 2.5 2.5L17 9" /><circle {...p} cx="10" cy="8" r="1.3" /></>,
    wrist:   <><rect {...p} x="6" y="7" width="12" height="10" rx="4" /><path {...p} d="M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7" /><path {...p} d="M9 17v1.5A1.5 1.5 0 0010.5 20h3a1.5 1.5 0 001.5-1.5V17" /></>,
    sticker: <><path {...p} d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h8l6-6V5a2 2 0 00-2-2z" /><path {...p} d="M14 21v-4a2 2 0 012-2h4" /></>,
    key:     <><circle {...p} cx="8" cy="8" r="4" /><path {...p} d="M10.8 10.8L20 20" /><path {...p} d="M17 17l2-2" /><path {...p} d="M15 15l2-2" /></>,
    bobble:  <><circle {...p} cx="12" cy="7" r="4.3" /><path {...p} d="M7.5 13c-1.3.9-2.1 2.4-2.1 4.2h13.2c0-1.8-.8-3.3-2.1-4.2" /><path {...p} d="M4.5 21h15" /></>,
    jewelry: <><path {...p} d="M12 14l-4-5h8z" /><path {...p} d="M8 9l-3 4 7 8 7-8-3-4" /><path {...p} d="M8 9l4 0 4 0" /></>,
    star:    <path {...p} d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z" />,
    refresh: <><path {...p} d="M20 11a8 8 0 10-2.3 6.3" /><path {...p} d="M20 5v6h-6" /></>,
    edit:    <><path {...p} d="M5 19h3l9.5-9.5a2.1 2.1 0 00-3-3L5 16z" /><path {...p} d="M14 7l3 3" /></>,
    shield:  <><path {...p} d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /><path {...p} d="M9 12l2 2 4-4" /></>,
    truck:   <><rect {...p} x="2" y="6" width="12" height="9" rx="1.4" /><path {...p} d="M14 9h3.5L21 12.5V15h-7z" /><circle {...p} cx="6.5" cy="17.5" r="1.6" /><circle {...p} cx="17" cy="17.5" r="1.6" /></>,
    close:   <><path {...p} d="M6 6l12 12" /><path {...p} d="M18 6L6 18" /></>,
    trash:   <><path {...p} d="M4 7h16" /><path {...p} d="M10 11v6" /><path {...p} d="M14 11v6" /><path {...p} d="M5 7l1 13a2 2 0 002 2h8a2 2 0 002-2l1-13" /><path {...p} d="M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></>,
    text:    <><path {...p} d="M4 7V5h16v2" /><path {...p} d="M12 5v14" /><path {...p} d="M9 19h6" /></>,
    logo:    <><circle {...p} cx="12" cy="12" r="7" /><path {...p} d="M9 12a3 3 0 016 0" /><path {...p} d="M9 12v3M15 12v3" /></>,
    mark:    <><rect {...p} x="9" y="9" width="6" height="6" transform="rotate(45 12 12)" /></>,
    circle:  <><circle {...p} cx="12" cy="12" r="8" /><circle {...p} cx="12" cy="4" r="1.2" /></>,
    rect:    <><rect {...p} x="6" y="3" width="12" height="18" rx="2" /><circle {...p} cx="12" cy="3" r="1.2" /></>,
    slab:    <><rect {...p} x="5" y="3" width="14" height="18" rx="1.5" /><rect {...p} x="7" y="5.5" width="10" height="3" rx="0.6" /><rect {...p} x="7" y="10" width="10" height="9" rx="0.8" /></>,
    necklace:<><path {...p} d="M5 4 Q12 11 12 13" /><path {...p} d="M19 4 Q12 11 12 13" /><circle {...p} cx="12" cy="17" r="4" /></>,
    bracelet:<><path {...p} d="M3 12 Q12 6 21 12 Q12 18 3 12 Z" /><circle {...p} cx="12" cy="12" r="2.5" /></>,
    pin:     <><circle {...p} cx="12" cy="9" r="4.2" /><path {...p} d="M12 13.2 V20" /><circle {...p} cx="12" cy="9" r="1.6" /></>,
    magnet:  <><path {...p} d="M5 5 v8 a7 7 0 0 0 14 0 V5" /><path {...p} d="M5 5 h5 v8" /><path {...p} d="M14 13 V5 h5" /></>,
    plush:   <><circle {...p} cx="12" cy="9" r="5" /><ellipse {...p} cx="12" cy="17" rx="6" ry="4.5" /><path {...p} d="M12 4 V2" /><circle {...p} cx="12" cy="2" r="1.3" /><circle {...p} cx="10" cy="8.5" r="0.6" /><circle {...p} cx="14" cy="8.5" r="0.6" /><path {...p} d="M10.5 11 Q12 12.5 13.5 11" /></>,
    warn:    <><path {...p} d="M12 3 L22 20 H2 Z" /><path {...p} d="M12 10 V14" /><circle {...p} cx="12" cy="17.5" r="0.9" fill="currentColor" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0, ...style }} className={className} aria-hidden>
      {map[name]}
    </svg>
  );
}
