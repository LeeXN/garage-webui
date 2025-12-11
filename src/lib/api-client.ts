export const garageFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  // Use sessionStorage as primary, fallback to localStorage for migration
  let token = null;
  if (typeof window !== 'undefined') {
    token = sessionStorage.getItem('garage_token') || localStorage.getItem('garage_token');
  }
  
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    // We pass the token to the proxy, which will forward it to Garage
    // console.log('Using token:', token.substring(0, 10) + '...');
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Call the Next.js proxy
  const response = await fetch(`/api/garage${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== 'undefined' && token) {
        // Clear both to be safe
        sessionStorage.removeItem('garage_token');
        localStorage.removeItem('garage_token');
        window.location.reload();
      }
    }
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch (e) {
      // ignore json parse error
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json();
  // console.log(`[garageFetch] ${path} response:`, data);
  return data;
};

export const garageFetchText = async (path: string, options: RequestInit = {}): Promise<string> => {
  let token = null;
  if (typeof window !== 'undefined') {
    token = sessionStorage.getItem('garage_token') || localStorage.getItem('garage_token');
  }
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`/api/garage${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== 'undefined' && token) {
        sessionStorage.removeItem('garage_token');
        localStorage.removeItem('garage_token');
        window.location.reload();
      }
    }
    throw new Error(response.statusText);
  }

  return response.text();
};
