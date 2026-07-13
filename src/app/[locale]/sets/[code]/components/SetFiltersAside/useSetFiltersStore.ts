import { create } from 'zustand';
import { type SetFilters, defaultSetFilters } from './setFilters';

interface SetFiltersStore {
	filters: SetFilters;
	setFilters: (filters: SetFilters) => void;
}

/**
 * Holds the set-page filter state outside the route lifecycle, so switching tab
 * (which navigates to /sets/<code> and remounts the page) does not reset the
 * filters. Lives in-memory for the session.
 */
export const useSetFiltersStore = create<SetFiltersStore>((set) => ({
	filters: defaultSetFilters,
	setFilters: (filters) => set({ filters }),
}));
