import {
  forwardRef,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export interface FormFieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  className?: string;
  labelClassName?: string;
}

export const FormField = ({
  label,
  hint,
  error,
  htmlFor,
  className,
  labelClassName,
  children,
}: PropsWithChildren<FormFieldProps>) => {
  const classes = ["rl-field", className].filter(Boolean).join(" ");
  const labelClasses = ["rl-field-label", labelClassName].filter(Boolean).join(" ");
  return (
    <label className={classes} htmlFor={htmlFor}>
      {label ? <span className={labelClasses}>{label}</span> : null}
      {children}
      {hint && !error ? <span className="rl-field-hint">{hint}</span> : null}
      {error ? <span className="rl-field-error">{error}</span> : null}
    </label>
  );
};

export const FormRow = ({ children, className }: PropsWithChildren<{ className?: string }>) => (
  <div className={["rl-field-row", className].filter(Boolean).join(" ")}>{children}</div>
);

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  const classes = ["rl-input", invalid ? "rl-input--error" : null, className]
    .filter(Boolean)
    .join(" ");
  return <input ref={ref} className={classes} {...rest} />;
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  const classes = ["rl-textarea", invalid ? "rl-textarea--error" : null, className]
    .filter(Boolean)
    .join(" ");
  return <textarea ref={ref} className={classes} {...rest} />;
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, ...rest },
  ref,
) {
  const classes = ["rl-select", invalid ? "rl-select--error" : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <select ref={ref} className={classes} {...rest}>
      {children}
    </select>
  );
});

export interface CheckboxFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode;
  hint?: ReactNode;
  wrapperClassName?: string;
}

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(function CheckboxField(
  { label, hint, wrapperClassName, className, type = "checkbox", ...rest },
  ref,
) {
  return (
    <label className={["rl-checkbox-field", wrapperClassName].filter(Boolean).join(" ")}>
      <input ref={ref} type={type} className={className} {...rest} />
      <span>
        {label}
        {hint ? <span className="rl-field-hint"> — {hint}</span> : null}
      </span>
    </label>
  );
});
