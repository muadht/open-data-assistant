import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { tableSummary, useTableDetails } from '@/tables/details'
import { TableActions, TableStructure } from './TableDetails'

interface Props {
  productId: number | null
  onClose: () => void
  onAsk: (table: { productId: number; title: string }) => void
}

/** A table's details in a side drawer over the page (#56): metadata, its dimensions and
 * their main members, and the ways to use it - ask about it, or open it on StatCan. */
export function TableDrawer({ productId, onClose, onAsk }: Props) {
  const loaded = useTableDetails(productId)
  const details = loaded?.details

  return (
    <Sheet
      open={productId !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="pr-6 leading-snug">
            {details?.table.title_en ?? 'Table details'}
          </SheetTitle>
          <SheetDescription>
            {productId !== null && tableSummary(productId, details)}
          </SheetDescription>
        </SheetHeader>
        <TableStructure loaded={loaded} />
        <SheetFooter className="flex-row gap-2 border-t">
          <TableActions productId={productId} details={details} onAsk={onAsk} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
