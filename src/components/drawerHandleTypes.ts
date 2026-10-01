export type DrawerHandleProps = {
  open: boolean;
  color: string;
  label: string;
  onToggle: () => void;
  onStart: () => void;
  onDrag: (delta: number) => void;
  onEnd: (velocity: number) => void;
};
