export function MeuxeMark({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-[1.25rem] bg-blue-600 text-white shadow-sm ${className}`}
      aria-hidden
    >
      <svg className="h-[55%] w-[55%]" viewBox="0 0 32 32" fill="none">
        <path
          d="M8 22V10l4 6 4-6 4 6 4-6v12"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
