import { Link } from 'react-router-dom';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Home } from 'lucide-react';

/**
 * @param {{ title: string, breadcrumbs?: Array<{ label: string, href?: string }> }} props
 */
export default function PageHeader({ title, breadcrumbs = [] }) {
  return (
    <div className="space-y-2 mb-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/"><Home className="h-3.5 w-3.5" /></Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {breadcrumbs.map((item, i) => (
            <BreadcrumbItem key={i}>
              <BreadcrumbSeparator />
              {item.href ? (
                <BreadcrumbLink asChild>
                  <Link to={item.href}>{item.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
    </div>
  );
}
