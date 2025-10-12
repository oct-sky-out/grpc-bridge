// Shared types for grpc-bridge

export interface GrpcService {
  name: string;
  methods: string[];
}

export interface GrpcRequest {
  service: string;
  method: string;
  payload: string;
}

export interface GrpcResponse {
  data: unknown;
  error?: string;
}
