import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { GameService } from './game.service';
import { CreateGameDto, UpdateGameDto } from './dto/create-game.dto';
import { CreateServerDto, UpdateServerDto } from './dto/create-server.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  // 玩家端API - 获取已启用的游戏列表
  @Public()
  @Get('enabled')
  findEnabled() {
    return this.gameService.findEnabled();
  }

  // 管理端API - 需要认证
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.gameService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gameService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(@Body() createGameDto: CreateGameDto) {
    return this.gameService.create(createGameDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateGameDto: UpdateGameDto) {
    return this.gameService.update(id, updateGameDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gameService.remove(id);
  }

  // 区服管理
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get(':gameId/servers')
  findServersByGame(@Param('gameId') gameId: string) {
    return this.gameService.findServersByGame(gameId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post(':gameId/servers')
  createServer(
    @Param('gameId') gameId: string,
    @Body() createServerDto: Omit<CreateServerDto, 'gameId'>,
  ) {
    return this.gameService.createServer({ ...createServerDto, gameId });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('servers/:id')
  updateServer(@Param('id') id: string, @Body() updateServerDto: UpdateServerDto) {
    return this.gameService.updateServer(id, updateServerDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('servers/:id')
  removeServer(@Param('id') id: string) {
    return this.gameService.removeServer(id);
  }
}
