import { Children, type ReactNode } from "react";

type CarouselProps = {
  title: string;
  children: ReactNode;
  emptyLabel?: string;
};

export function Carousel({ title, children, emptyLabel = "Sem titulos nesta lista." }: CarouselProps) {
  const hasItems = Children.count(children) > 0;

  return (
    <section className="catalog-section">
      <div className="section-header">
        <h2>{title}</h2>
      </div>
      <div className="title-rail">
        {hasItems ? children : <p className="empty-state">{emptyLabel}</p>}
      </div>
    </section>
  );
}
