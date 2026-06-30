const fs = require('fs');

(async () => {
  try {
    const params = new URLSearchParams({
      refresh_token: "1000.d502141847d1aecdace061139c0c08b9.78129dd4c72207a59d063a294c0513be",
      client_id: "1000.xxx", // I need the client id. Wait, I should read from .env.
    });
  } catch(e) {}
})();
