import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 25,
  duration: '20s',
};

export default function () {
  const res = http.get(
    'https://spendly-production-1bdf.up.railway.app/api/safe-to-spend'
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
