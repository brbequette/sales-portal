import { Metadata } from 'next';
import ShopClient from './ShopClient';

export const metadata: Metadata = {
  title: 'Shop | Titan Diamond USA',
  description: 'Browse our premium selection of diamond blades, core bits, cup wheels, and polishing pads.',
};

export default function ShopPage() {
  return <ShopClient />;
}
