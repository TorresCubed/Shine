import type { ComponentChildren } from 'preact';
import { goBack } from '../store';
import { cx } from '../cx';

type Props = {
  onClick: () => void;
  variant?: 'primary' | 'quiet';
  className?: string;
  title?: string;
  children: ComponentChildren;
};

export const MenuItem = ({ onClick, variant, className, title, children }: Props) => (
  <button className={cx('menu-item', variant, className)} onClick={onClick} title={title}>
    {children}
  </button>
);

export const BackButton = () => (
  <MenuItem className="menu-back" onClick={goBack}>
    Back
  </MenuItem>
);
