(function (root) {
  'use strict';

  const BRAND_OPTIONS = [
    { name: 'คุ้มสึ', prefix: 'KS' },
    { name: 'หมีปุ้ง หมูปิ้ง หมูปิ้งโบราณ', prefix: 'MHE' },
    { name: 'ไก่ทอดแอนโทนี่', prefix: 'ANT' },
    { name: 'โซ้ย นู้ดเดิ้ล Zoyy Noodle', prefix: 'ZN' },
    { name: 'นัว นัว สุกี้แห้ง', prefix: 'NNS' },
    { name: 'ข่า ตะไคร้ ใบมะกรูด (อาหารใต้)', prefix: 'GT' },
  ];
  const CHANNEL_OPTIONS = ['Lineman', 'Grab', 'Shopee', 'Robinhood', 'Foodstory'];

  function brandCode(name, branchCode) {
    const brand = BRAND_OPTIONS.find((option) => option.name === name);
    const suffix = String(branchCode || '').match(/(\d+)$/)?.[1];
    return brand && suffix ? `${brand.prefix}${suffix}` : '';
  }

  function isFoodstory(name) {
    return /^food\s*story$/i.test(String(name || '').trim());
  }

  const catalog = { BRAND_OPTIONS, CHANNEL_OPTIONS, brandCode, isFoodstory };
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.BranchAccessCatalog = catalog;
})(typeof globalThis === 'object' ? globalThis : this);
