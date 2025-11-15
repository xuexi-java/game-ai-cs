import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  gameId: string;

  @IsString()
  @IsOptional()
  serverId?: string;

  @IsString()
  @IsOptional()
  serverName?: string;

  @IsString()
  @IsNotEmpty()
  playerIdOrName: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  @IsOptional()
  occurredAt?: string;

  @IsString()
  @IsOptional()
  paymentOrderNo?: string;
}

export class TicketResponseDto {
  ticketId: string;
  ticketNo: string;
  token: string;
}
