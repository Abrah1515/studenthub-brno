"use client";

import { Trash2, X } from "lucide-react";
import { useModalDialog } from "@/lib/use-modal-dialog";

type Props = {
  open: boolean;
  title: string;
  description: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDeleteDialog({ open, title, description, pending = false, onCancel, onConfirm }: Props) {
  const dialogRef = useModalDialog<HTMLDivElement>(open, onCancel);
  if (!open) return null;
  return (
    <div className="modal-backdrop owner-delete-layer" data-modal-layer onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div ref={dialogRef} tabIndex={-1} className="modal-card owner-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-delete-title" aria-describedby="owner-delete-description" data-modal-layer>
        <div className="modal-head">
          <div><span className="eyebrow">Potvrzení</span><h2 id="owner-delete-title">{title}</h2></div>
          <button type="button" className="icon-button" aria-label="Zavřít potvrzení" onClick={onCancel} disabled={pending}><X size={19} /></button>
        </div>
        <p id="owner-delete-description">{description}</p>
        <div className="form-footer">
          <button type="button" className="button button-secondary" data-autofocus onClick={onCancel} disabled={pending}>Zrušit</button>
          <button type="button" className="button button-danger" onClick={onConfirm} disabled={pending}><Trash2 size={16} />{pending ? "Mažu…" : "Smazat"}</button>
        </div>
      </div>
    </div>
  );
}
