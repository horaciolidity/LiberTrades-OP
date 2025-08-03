# react-helmet-next

## Introduction

[react-helmet-next](https://github.com/blencm/react-helmet) is a fork of [React Helmet](https://github.com/nfl/react-helmet) designed for managing document head tags dynamically in modern React applications. Unlike `react-helmet`, this package requires a `<HelmetProvider>` to encapsulate state per request, making it more suitable for server-side rendering (SSR) and concurrent rendering environments.

## Installation

You can install the package using your preferred package manager:

```sh
# Using pnpm
pnpm add react-helmet-next

# Using npm
npm install react-helmet-next

# Using yarn
yarn add react-helmet-next
```

## Usage

### Basic Example

Wrap your application in a `<HelmetProvider>` to encapsulate the state for `<Helmet>`:

```jsx
import React from 'react';
import ReactDOM from 'react-dom';
import { Helmet, HelmetProvider } from 'react-helmet-next';

const App = () => (
  <HelmetProvider>
    <div>
      <Helmet>
        <title>My App</title>
      </Helmet>
      <h1>Welcome to My App</h1>
    </div>
  </HelmetProvider>
);

ReactDOM.render(<App />, document.getElementById('root'));
```

### Server-Side Rendering (SSR)

On the server, use the `context` prop to collect metadata during rendering:

```jsx
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Helmet, HelmetProvider } from 'react-helmet-next';

const helmetContext = {};

const App = () => (
  <HelmetProvider context={helmetContext}>
    <div>
      <Helmet>
        <title>Server-Side Rendered Page</title>
      </Helmet>
      <h1>Welcome to SSR</h1>
    </div>
  </HelmetProvider>
);

const html = renderToString(<App />);
const { helmet } = helmetContext;

console.log(helmet.title.toString()); // Outputs: <title>Server-Side Rendered Page</title>
```

### Streaming Support

To support streaming SSR, ensure `<head>` data is rendered outside `renderToNodeStream()`:

```jsx
import through from 'through';
import { renderToNodeStream } from 'react-dom/server';
import { Helmet, HelmetProvider } from 'react-helmet-next';
import template from 'server/template';

const helmetContext = {};

const App = () => (
  <HelmetProvider context={helmetContext}>
    <div>
      <Helmet>
        <title>Streaming Page</title>
      </Helmet>
      <h1>Streaming Rendering</h1>
    </div>
  </HelmetProvider>
);

const [header, footer] = template({ helmet: helmetContext.helmet });

res.status(200);
res.write(header);
renderToNodeStream(<App />)
  .pipe(
    through(
      function write(data) { this.queue(data); },
      function end() {
        this.queue(footer);
        this.queue(null);
      }
    )
  )
  .pipe(res);
```

### Testing with Jest

If using Jest and needing to emulate SSR behavior, set `HelmetProvider.canUseDOM = false`:

```jsx
import { HelmetProvider } from 'react-helmet-next';

HelmetProvider.canUseDOM = false;
```

### SEO Optimization

To prioritize SEO tags, use the `prioritizeSeoTags` flag:

```jsx
<Helmet prioritizeSeoTags>
  <title>SEO Optimized Page</title>
  <meta property="og:title" content="An Important Title"/>
  <link rel="canonical" href="https://example.com" />
</Helmet>
```

Server-side rendering:

```html
<head>
  ${helmet.title.toString()}
  ${helmet.priority.toString()}
  ${helmet.meta.toString()}
  ${helmet.link.toString()}
</head>
```

### Usage Without Context

You can manually create a `HelmetData` instance to manage state without using `<HelmetProvider>`:

```jsx
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Helmet, HelmetData } from 'react-helmet-next';

const helmetData = new HelmetData({});

const App = () => (
  <Helmet helmetData={helmetData}>
    <title>Standalone Helmet</title>
    <link rel="canonical" href="https://example.com" />
  </Helmet>
);

const html = renderToString(<App />);
const { helmet } = helmetData.context;
```

## License

This package is licensed under the MIT License.