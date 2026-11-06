import { useSyncExternalStore } from 'react';

import { getUpdateState, subscribeToUpdates } from '@/services/updates';

export const useUpdates = () => useSyncExternalStore(subscribeToUpdates, getUpdateState, getUpdateState);
