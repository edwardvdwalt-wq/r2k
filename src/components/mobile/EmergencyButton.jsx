import React from 'react';
import { Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * EmergencyButton - Large phone/email call-to-action
 * Designed for field safety use with large tap targets
 */
export default function EmergencyButton({
  type = 'phone',
  value,
  label,
  className = '',
}) {
  if (!value) return null;

  const isPhone = type === 'phone';
  const href = isPhone ? `tel:${value}` : `mailto:${value}`;
  const Icon = isPhone ? Phone : Mail;

  return (
    <a href={href} className="w-full">
      <Button
        className={cn(
          "w-full h-14 md:h-12 text-base md:text-sm font-semibold",
          "gap-3 justify-center",
          isPhone ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700",
          className
        )}
      >
        <Icon size={20} />
        <span>{label}</span>
      </Button>
    </a>
  );
}