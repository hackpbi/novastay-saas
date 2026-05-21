import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  invokeSyncHolidays,
  type SyncHolidaysRequest,
  type SyncHolidaysResponse,
} from '@/lib/edge-functions'

export function useSyncHolidays() {
  const queryClient = useQueryClient()

  return useMutation<SyncHolidaysResponse, Error, SyncHolidaysRequest>({
    mutationFn: invokeSyncHolidays,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['c07_public_calendar'] })
      queryClient.invalidateQueries({ queryKey: ['c06_calendar'] })
      queryClient.invalidateQueries({ queryKey: ['holidays'] })
    },
  })
}
