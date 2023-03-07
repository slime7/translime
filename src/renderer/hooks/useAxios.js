import axios from 'axios';

// 使用 node 提供的 http 作为 axios 的 adapter
// axios.defaults.adapter = window.electron.axiosHttpAdapter;
// 新版本暂时没有方便的办法设置 adapter

export default axios;
