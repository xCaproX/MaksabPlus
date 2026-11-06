export default function DocumentCreatorCell({ name }: { name?: string | null }) {
  return <td className="col-creator">{name?.trim() || 'غير مسجل'}</td>;
}
