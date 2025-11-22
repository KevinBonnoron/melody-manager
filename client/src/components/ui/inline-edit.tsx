import { Check, Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { Input } from './input';

interface InlineEditProps {
	value: string;
	onSave: (newValue: string) => Promise<void> | void;
	className?: string;
	inputClassName?: string;
	disabled?: boolean;
}

export function InlineEdit({ value, onSave, className = '', inputClassName = '', disabled = false }: InlineEditProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(value);
	const [isSaving, setIsSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	useEffect(() => {
		setEditValue(value);
	}, [value]);

	const handleSave = async () => {
		if (editValue.trim() === '' || editValue === value) {
			setIsEditing(false);
			setEditValue(value);
			return;
		}

		setIsSaving(true);
		try {
			await onSave(editValue.trim());
			setIsEditing(false);
		} catch (error) {
			setEditValue(value);
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		setEditValue(value);
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleSave();
		} else if (e.key === 'Escape') {
			handleCancel();
		}
	};

	if (disabled) {
		return <span className={className}>{value}</span>;
	}

	if (!isEditing) {
		return (
			<button
				type="button"
				onClick={() => setIsEditing(true)}
				className={`group inline-flex items-center gap-2 hover:text-primary transition-colors ${className}`}
			>
				<span>{value}</span>
				<Pencil className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
			</button>
		);
	}

	return (
		<div className="inline-flex items-center gap-2">
			<Input
				ref={inputRef}
				value={editValue}
				onChange={(e) => setEditValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleSave}
				disabled={isSaving}
				className={inputClassName}
			/>
			<div className="flex items-center gap-1">
				<Button type="button" size="icon" variant="ghost" onClick={handleSave} disabled={isSaving} className="h-8 w-8">
					<Check className="h-4 w-4" />
				</Button>
				<Button type="button" size="icon" variant="ghost" onClick={handleCancel} disabled={isSaving} className="h-8 w-8">
					<X className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
