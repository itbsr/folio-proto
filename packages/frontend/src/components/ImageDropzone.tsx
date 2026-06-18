import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { fileToBase64, isAcceptableImage, IMAGE_ACCEPT } from '../lib/imageFile';

type Props = {
  onFile?: (base64: string) => void;    // single-file (backward compat)
  onFiles?: (base64s: string[]) => void; // multi-file
  multiple?: boolean;
  disabled?: boolean;
};

export function ImageDropzone({ onFile, onFiles, multiple, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = (fileList: FileList | null | undefined) => {
    if (!fileList || fileList.length === 0) return;
    const valid = Array.from(fileList).filter(isAcceptableImage);
    if (!valid.length) return;
    if (multiple && onFiles) {
      Promise.all(valid.map(fileToBase64)).then(onFiles).catch(console.error);
    } else {
      fileToBase64(valid[0]).then((b64) => onFile?.(b64)).catch(console.error);
    }
  };

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files); }}
      style={{
        border: `2px dashed ${dragging ? '#3b82f6' : '#d1d5db'}`,
        borderRadius: 12,
        padding: '3rem 2rem',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: dragging ? '#eff6ff' : '#f9fafb',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
      }}
    >
      <Upload size={36} color="#9ca3af" style={{ marginBottom: 12 }} />
      <p style={{ margin: 0, color: '#374151', fontWeight: 500 }}>
        {multiple ? '画像をドロップ、またはクリックして選択（複数可）' : '画像をドロップ、またはクリックして選択'}
      </p>
      <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>JPEG / PNG / HEIC</p>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}
