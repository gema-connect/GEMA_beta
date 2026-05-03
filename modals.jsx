// Minimal stroke-icon set (Lucide-style geometry)
const Icon = ({ name, size = 20, stroke = 1.6, style = {} }) => {
  const s = size;
  const common = {
    width: s, height: s, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round', strokeLinejoin: 'round', style,
  };
  const paths = {
    droplet: <path d="M12 3 6.5 10.5a7 7 0 1 0 11 0Z" />,
    'circle-dot': <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 16h18M9 4v16M15 4v16" /></>,
    gauge: <><path d="M12 14 8 9" /><path d="M3.5 14a8.5 8.5 0 1 1 17 0" /><circle cx="12" cy="14" r="1.5" /></>,
    'arrow-up': <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    close: <><path d="M18 6 6 18M6 6l18 12" transform="scale(0.667) translate(0,0)" /><path d="M18 6 6 18M6 6l12 12" /></>,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    chevron: <path d="m9 6 6 6-6 6" />,
    'chevron-down': <path d="m6 9 6 6 6-6" />,
    check: <path d="m5 12 5 5L20 7" />,
    pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    bucket: <><path d="M5 7h14l-1.4 12.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8Z" /><path d="M5 7c0-2 3-4 7-4s7 2 7 4" /></>,
    sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" /></>,
    grad: <><path d="M22 9 12 4 2 9l10 5 10-5Z" /><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" /></>,
    inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" /></>,
    grip: <><circle cx="9" cy="6" r="1.2" /><circle cx="9" cy="12" r="1.2" /><circle cx="9" cy="18" r="1.2" /><circle cx="15" cy="6" r="1.2" /><circle cx="15" cy="12" r="1.2" /><circle cx="15" cy="18" r="1.2" /></>,
    note: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  };
  return <svg {...common}>{paths[name] || null}</svg>;
};

window.Icon = Icon;
