export function NoticeCard(props: { text: string; onClose: () => void }) {
  return (
    <section className="flex items-center justify-between gap-3 rounded-xl bg-indigo-50/50 px-3 py-2 text-[12px] text-indigo-700">
      <span>{props.text}</span>
      <button className="font-medium hover:text-indigo-900" onClick={props.onClose} type="button">关闭</button>
    </section>
  );
}