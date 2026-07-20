import { useState, useEffect } from "react";
import { OrderBuilder, OrderLine } from "./OrderBuilder";
import { toast } from "react-hot-toast";

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
  const [orderLines, setOrderLines] = useState<OrderLine[]>(initialLines);
  const [catalog, setCatalog] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/products").then(res => res.json()).then(data => {
      if (data.success) setCatalog(data.products || []);
    });
  }, []);

  return (
    <div className="flex flex-col h-full space-y-4">
      <OrderBuilder 
        orderLines={orderLines}
        setOrderLines={setOrderLines}
        catalogProducts={catalog}
        accountName={accountName}
        accountDetail={accountDetail}
      />
      <div className="flex justify-end gap-2 pt-4 border-t border-neutral-800">
        {onCancel && (
          <button onClick={onCancel} className="px-4 py-2 text-sm text-neutral-400 hover:text-white font-bold transition-colors">
            Cancel
          </button>
        )}
        <button onClick={() => {
          toast.success("Order submitted successfully!");
          if (onSuccess) onSuccess();
        }} className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg transition-colors">
          Submit Order
        </button>
      </div>
    </div>
  )
}
