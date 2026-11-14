interface ItemNameDisplayProps {
  code?: string | null;
  name: string;
  unit?: string | null;
}

/** عرض موحد لبيانات الصنف داخل الجداول بالترتيب: الكود، الاسم، الوحدة */
export default function ItemNameDisplay({ code, name, unit }: ItemNameDisplayProps) {
  return (
    <div className="inserted-item-info">
      {code && (
        <span className="item-code-tag" dir="ltr">
          {code}
        </span>
      )}
      <span className="item-name">{name}</span>
      {unit && <span className="item-unit-tag">{unit}</span>}
    </div>
  );
}
