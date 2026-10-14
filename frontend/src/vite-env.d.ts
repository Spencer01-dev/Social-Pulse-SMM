/// <reference types="vite/client" />

interface Window {
  fbq?: {
    (command: 'init', pixelId: string, options?: Record<string, unknown>): void;
    (command: 'track', eventName: string, parameters?: Record<string, unknown>, eventId?: { eventID?: string }): void;
    (command: 'trackCustom', eventName: string, parameters?: Record<string, unknown>, eventId?: { eventID?: string }): void;
    callMethod?: (...args: any[]) => void;
    queue?: any[];
    loaded?: boolean;
    version?: string;
  };
  _fbq?: any;
}
