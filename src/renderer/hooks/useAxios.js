import axios from 'axios';

// 使用 node 提供的 http 作为 axios 的 adapter
axios.defaults.adapter = window.electron.axiosHttpAdapter;

export default axios;
