module.exports = {
  apps: [
    {
      name: "bang-server",
      script: "server/index.js",
      cwd: "/var/www/bang/current",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 20,
      min_uptime: "10s",
      time: true,
      out_file: "/dev/null",
      error_file: "/var/www/bang/shared/logs/pm2-error.log",
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },
  ],
};
