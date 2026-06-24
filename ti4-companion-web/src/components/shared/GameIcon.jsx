export default function GameIcon({ category, name, size = 16, className, alt }) {
  return (
    <img
      src={`/icons/${category}/${name}.svg`}
      width={size}
      height={size}
      alt={alt ?? name}
      className={className}
      onError={e => { e.currentTarget.style.display = 'none' }}
    />
  )
}

export function SvgImageIcon({ category, name, x, y, size, ...props }) {
  return (
    <image
      href={`/icons/${category}/${name}.svg`}
      x={x}
      y={y}
      width={size}
      height={size}
      {...props}
    />
  )
}
