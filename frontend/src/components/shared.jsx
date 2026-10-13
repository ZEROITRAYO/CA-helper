import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";

export function Section({ title, description, contentClassName, children, ...cardProps }) {
  return (
    <Card {...cardProps}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children && <CardContent className={contentClassName}>{children}</CardContent>}
    </Card>
  );
}