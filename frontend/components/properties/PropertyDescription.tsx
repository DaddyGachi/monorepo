interface PropertyDescriptionProps {
  description: string
}

export function PropertyDescription({ description }: PropertyDescriptionProps) {
  return (
    <div className="border-3 border-foreground bg-card p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] sm:p-6">
      <h2 className="font-mono text-lg font-bold mb-3 sm:text-xl sm:mb-4">
        About This Property
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed sm:text-base">
        {description}
      </p>
    </div>
  )
}
