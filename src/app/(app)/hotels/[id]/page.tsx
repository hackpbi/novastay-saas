import HotelDetailPage from '@/views/HotelDetailPage'

export default function Page({ params }: { params: { id: string } }) {
  return <HotelDetailPage id={params.id} />
}
