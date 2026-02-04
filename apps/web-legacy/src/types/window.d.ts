import type { WebrtcProvider } from 'y-webrtc';
import type { ResetResult } from '@/utils/resetStorage';

declare global {
  interface Window {
    __resetShipyard?: () => Promise<ResetResult>;
    planIndexRtcProvider?: WebrtcProvider;
    planRtcProvider?: WebrtcProvider;
  }
}
