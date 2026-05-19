import { z } from 'zod';

export type Font = {
    label: string;
    value: string;
};

export const FONT_OPTIONS: Font[] = [
    { label: 'Inter', value: 'Inter' },
    { label: 'Poppins', value: 'Poppins' },
    { label: 'IBM Plex Mono', value: 'IBM Plex Mono' },
];

export const FontValueSchema = z.enum(
    FONT_OPTIONS.map((option) => option.value) as [string, ...string[]],
);
