process.on('message', msg => {
  if (msg === 'sample') process.send({ memory: process.memoryUsage(), cpu: process.cpuUsage(), resource: process.resourceUsage(), at: performance.now() });
});
