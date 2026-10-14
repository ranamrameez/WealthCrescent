import { toast } from './Toast';
import { ToggleChip } from './ui/ToggleChip';

export function DesktopProfitAlertsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const toggle = async (next: boolean) => {
    if (!next) {
      onChange(false);
      return;
    }
    if (!('Notification' in window)) {
      toast('Desktop notifications are not supported by this browser.');
      return;
    }
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
    if (permission !== 'granted') {
      toast('Allow notifications in your browser to enable desktop P/L alerts.');
      return;
    }
    onChange(true);
    toast('Desktop P/L alerts enabled.');
  };

  return (
    <ToggleChip
      checked={checked}
      onChange={(next) => void toggle(next)}
      label="Show P/L alerts as desktop notifications"
    />
  );
}
