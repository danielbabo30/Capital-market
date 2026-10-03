const Svg = ({ children }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const PlusIcon = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const RefreshIcon = () => (
  <Svg>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
  </Svg>
);
export const DollarIcon = () => <Svg><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></Svg>;
export const ImportIcon = () => <Svg><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 7v9" /><path d="m8 12 4 4 4-4" /></Svg>;
