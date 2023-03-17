import axios from 'axios';

const useAxios = (adapter) => {
// 使用 node 提供的 http 作为 axios 的 adapter
  axios.defaults.adapter = adapter || window.electron.axiosHttpAdapter;

  const axiosWithHttp = axios.create();
  axiosWithHttp.interceptors.response.use(
    (response) => {
      const {
        request,
        config,
        data,
        headers,
        status,
      } = response;
      if (config.adapter === 'xhr') {
        return response;
      }
      /* eslint-disable no-console,no-underscore-dangle */
      console.groupCollapsed(
        `%c ${request.method} ${request.path} `,
        'background: rgb(70, 70, 70); color: rgb(240, 235, 200); width:100%;',
      );
      console.log('Time: ', new Date());
      console.log('Method: ', request.method || config.method);
      console.log('Status: ', status);
      console.log('Host: ', `${request.protocol}${request.host}`);
      console.log('Path: ', request.path);
      console.log('Params: ', config.params);
      console.log('Data: ', config.data);
      console.log('Request Headers: ');
      console.log(request._header);
      console.log('Response Headers: ', headers);
      console.log('Response data: ', data);
      console.groupEnd();
      /* eslint-enable no-console,no-underscore-dangle */
      return response;
    },
  );

  return axiosWithHttp;
};

export default useAxios;
