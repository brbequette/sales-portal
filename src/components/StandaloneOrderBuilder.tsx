import { OrderBuilder, OrderLine } from "./OrderBuilder";

export function StandaloneOrderBuilder({
  accountId,
  accountName,
  accountDetail,
  initialLines = [],
  onCancel,
  onSuccess
}: {
  accountId: string;
  accountName?: string;
  accountDetail?: any;
  initialLines?: OrderLine[];
  onCancel?: () => void;
  onSuccess?: () => void;
}) {
  return (
    <div className="flex flex-col h-full space-y-4">
      <OrderBuilder 
        orderLines={initialLines.length > 0 ? initialLines : undefined}
        accountName={accountName}
        accountDetail={accountDetail}
        accountId={accountId}
        onCancel={onCancel}
        onSuccess={onSuccess}
      />
    </div>
  )
}
