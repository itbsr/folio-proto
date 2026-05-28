import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

type Props = {
  onFile: (base64: string) => void;
  disabled?: boolean;
};

export function ImageDropzone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = (reader.result as string).split(',')[1];
      onFile(result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
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
      <p style={{ margin: 0, color: '#374151', fontWeight: 500 }}>画像をドロップ、またはクリックして選択</p>
      <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>JPEG / PNG</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handle(e.target.files?.[0])}
      />
    </div>
  );
}
