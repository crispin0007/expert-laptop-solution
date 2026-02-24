interface Props {
  isAvailable: boolean
  openTickets?: number
  activeTasks?: number
  showLabel?: boolean
}

export default function AvailabilityBadge({ isAvailable, openTickets = 0, activeTasks = 0, showLabel = true }: Props) {
  const total = openTickets + activeTasks
  return (
    <span
      title={`${openTickets} open tickets · ${activeTasks} active tasks`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
        isAvailable ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isAvailable ? 'bg-green-500' : 'bg-yellow-500'}`} />
      {showLabel && (isAvailable ? 'Free' : `Busy (${total})`)}
    </span>
  )
}
