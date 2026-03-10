/**
 * useFiscalYear
 * =============
 * Hook that provides the current Nepal fiscal year info and the
 * server-confirmed values from GET /reports/current-fiscal-year/.
 *
 * Returns both the client-side computed FY (instant, no loading) and
 * the server-confirmed FY with exact AD dates (async).
 */

import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';
import { currentFiscalYear, FiscalYear, fiscalYearDateRange, adToIso } from '../utils/nepaliDate';

interface ServerFiscalYear {
  fiscal_year: string;
  bs_year: number;
  label_full: string;
  start_ad: string;
  end_ad: string;
  start_bs: string;
  start_bs_en: string;
  start_bs_np: string;
  end_bs: string;
  end_bs_en: string;
  end_bs_np: string;
}

export function useFiscalYear() {
  // Client-side instant value (no async)
  const clientFy: FiscalYear = currentFiscalYear();
  const { startAd, endAd } = fiscalYearDateRange(clientFy);

  // Server-confirmed value (confirms exact BS calendar boundary)
  const { data: serverFy, isLoading } = useQuery<ServerFiscalYear>({
    queryKey: ['fiscal-year'],
    queryFn: async () => {
      const res = await apiClient.get('/accounting/reports/current-fiscal-year/');
      return res.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour — FY changes once a year
    retry: false,
  });

  return {
    /** Instantly available, computed on client (no loading). */
    clientFy,
    /** Client-computed AD start date (ISO string). */
    startAd: serverFy?.start_ad ?? adToIso(startAd),
    /** Client-computed AD end date (ISO string). */
    endAd: serverFy?.end_ad ?? adToIso(endAd),
    /** FY label e.g. "2081/082". */
    label: serverFy?.fiscal_year ?? clientFy.label,
    /** Full label e.g. "2081/2082". */
    labelFull: serverFy?.label_full ?? clientFy.labelFull,
    /** BS start display (English): "1 Shrawan 2081". */
    startBsEn: serverFy?.start_bs_en ?? `1 Shrawan ${clientFy.bsYear}`,
    /** BS end display (English). */
    endBsEn: serverFy?.end_bs_en,
    /** Server data (may be undefined while loading). */
    serverFy,
    isLoading,
  };
}
