import { createHandler, StartServer } from '@solidjs/start/server';

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Brevwick — SolidStart example</title>
          {assets}
        </head>
        <body style="margin:0;">
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
