import { toast } from "react-hot-toast";
import React from "react";

export function toastConfirm(message: string, onConfirm: () => void) {
  toast((t) => (
    <div>
      <p className="font-medium">{message}</p>
      <div className="flex gap-2 mt-3 justify-end">
        <button
          onClick={() => {
            toast.dismiss(t.id);
            onConfirm();
          }}
          className="bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg text-white text-sm font-bold transition-colors"
        >
          Yes
        </button>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5 rounded-lg text-white text-sm font-bold transition-colors"
        >
          No
        </button>
      </div>
    </div>
  ), { duration: Infinity });
}
