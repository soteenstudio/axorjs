export const MODIFIER_MAP: Record<
  string,
  { on: string; off: string | string[] }
> = {
  'hover:': { on: 'mouseenter', off: 'mouseleave' },
  'focus:': { on: 'focus', off: 'blur' },
  'active:': { on: 'mousedown', off: ['mouseup', 'mouseleave'] },
};
