import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'tab' | 'icon';
export type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
};

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: 'ui-button--primary',
  secondary: 'ui-button--secondary',
  danger: 'ui-button--danger',
  tab: 'ui-button--tab',
  icon: 'ui-button--icon',
};

/** Shared button primitive for consistent sizing, focus, disabled, and variant styles. */
export function Button({
  variant = 'secondary',
  size = 'md',
  active = false,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [
    'ui-button',
    buttonVariantClass[variant],
    `ui-button--${size}`,
    active ? 'is-active' : '',
    className,
  ].filter(Boolean).join(' ');

  return <button type={type} className={classes} {...props} />;
}

type CardProps = HTMLAttributes<HTMLElement> & {
  title?: string;
  description?: string;
  actions?: ReactNode;
};

/** Semantic section container with a consistent heading/action layout. */
export function Card({ title, description, actions, className = '', children, ...props }: CardProps) {
  return (
    <section className={['ui-card', className].filter(Boolean).join(' ')} {...props}>
      {title || description || actions ? (
        <div className="ui-card__header">
          <div className="ui-card__heading">
            {title ? <h2 className="ui-card__title">{title}</h2> : null}
            {description ? <p className="ui-card__description">{description}</p> : null}
          </div>
          {actions ? <div className="ui-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="ui-card__content">{children}</div>
    </section>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** Compact status indicator; color is paired with readable text rather than used alone. */
export function Badge({ tone = 'neutral', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={['ui-badge', `ui-badge--${tone}`, className].filter(Boolean).join(' ')} {...props} />;
}
